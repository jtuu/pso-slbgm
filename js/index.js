import m from "mithril";
import { Ogg, OggWorkerHandler } from "./ogg";
import { TrackTransitions, forest_transitions } from "./slbgm";
import { Timer, StreamButtons, TrackControls, TrackList, TrackPartQueue, InputSelector, generate_track_labels } from "./components";

const wasm_loading = wasm_bindgen();

const App = () => {
    const ogg = new Ogg();
    let audio = null; // Not allowed to construct AudioContext without user gesture
    let is_file_selected = false;
    let is_processing_ogg = false;
    let play_start_time = Infinity;
    let queue_duration = 0;
    let track_index = 0;
    let track_transitions = new TrackTransitions([]);
    const track_labels = [];
    const track_part_queue = [];
    const stream_queue = [];
    let queue_updater_timeout = null;
    let stream_stopper_timeout = null;

    const init_audio_from_gesture = () => {
        if (!audio) audio = new AudioContext();
    };

    const regenerate_track_data = (transitions) => {
        track_transitions.tracks.splice(0, track_transitions.tracks.length, ...transitions.tracks);
        track_labels.splice(0, track_labels.length, ...generate_track_labels(transitions.tracks.length));
    };

    const process_slbgm_from_path = async (file_path, transitions) => {
        init_audio_from_gesture();
        // One file at a time
        if (is_processing_ogg) return Promise.reject();

        const ogg_worker = OggWorkerHandler();
        is_file_selected = true;
        is_processing_ogg = true;
        ogg.filename = file_path;
        await ogg_worker.from_path(audio, ogg, file_path);
        is_processing_ogg = false;
        regenerate_track_data(transitions);
        m.redraw();
    };

    const process_slbgm_from_file = async (filename, slbgm_file, transition_file) => {
        init_audio_from_gesture();
        if (is_processing_ogg) return Promise.reject();

        const ogg_worker = OggWorkerHandler();
        is_file_selected = true;
        is_processing_ogg = true;
        ogg.filename = filename;
        const worker_working = ogg_worker.from_file(audio, ogg, slbgm_file);
        if (transition_file) {
            // Parse transition file while worker is working
            const transitions = TrackTransitions.from_file(transition_file);
            regenerate_track_data(transitions);
        }
        await worker_working;
        is_processing_ogg = false;
        m.redraw();
    };

    const is_playing = () => {
        if (audio && ogg.streams.length > 0) {
            return audio.currentTime >= play_start_time && audio.currentTime < play_start_time + queue_duration;
        }
        return false;
    };

    const playback_position = () => {
        if (audio && ogg.streams.length > 0) {
            return audio.currentTime - play_start_time;
        }
        return 0;
    };

    const start_queue_updater = () => {
        let prev_queue_update_time = null;
        let prev_queue_update_duration = 0;
        const update = () => {
            if (track_part_queue.length < 1) return;
            if (prev_queue_update_time === null) {
                prev_queue_update_time = audio.currentTime;
            };
            let current_part = track_part_queue[0];
            if (current_part.current_stream >= current_part.part_length) {
                track_part_queue.shift();
                if (track_part_queue.length < 1) return;
                current_part = track_part_queue[0];
                if (track_part_queue.length == 1) {
                    queue_next_track_part(current_part);
                }
            }
            const current_stream = ogg.streams[current_part.streams[current_part.current_stream]];
            const now = audio.currentTime;
            const actually_elapsed = (now - prev_queue_update_time) * 1000;
            const timer_jitter = actually_elapsed - prev_queue_update_duration; // Adapt to timer inaccuracy
            const anticipation = 16; // Update slightly earlier to prevent gaps in audio
            const timeout_duration = (current_stream.duration * 1000) + timer_jitter - anticipation;
            prev_queue_update_duration = timeout_duration;
            prev_queue_update_time = now;
            queue_stream(current_stream);
            queue_updater_timeout = setTimeout(() => {
                current_part.current_stream += 1;
                update();
                m.redraw();
            }, timeout_duration);
        };
        update();
    };

    const queue_stream = stream => {
        let when = 0;
        if (is_playing()) {
            when = queue_duration - (audio.currentTime - play_start_time);
        } else {
            play_start_time = audio.currentTime;
            queue_duration = 0;
        }
        stream_queue.push(stream);
        queue_duration += stream.duration;
        stream.queue(audio, when);
    };

    const play_stream = stream => {
        stop_playback();
        queue_stream(stream);
        stream_stopper_timeout = setTimeout(() => {
            stop_playback();
            m.redraw();
        }, stream.duration * 1000);
    };

    const get_track_index = () => {
        return track_index;
    };

    const get_track_count = () => {
        return track_transitions.tracks.length;
    };

    const change_track = i => {
        if (i == track_index) return;

        track_index = i;
        track_index %= track_transitions.tracks.length;

        if (track_part_queue.length < 1) return;

        const current_part = track_part_queue[0];
        let out_part;
        let in_part;
        // Can't transition if last stream is already playing, use next in queue
        if (current_part.current_stream >= current_part.part_length - 1) {
            out_part = track_part_queue[1];
            track_part_queue.splice(2);
            queue_next_track_part(out_part);
            in_part = track_part_queue[2];
        } else {
            out_part = track_part_queue[0];
            track_part_queue.splice(1);
            queue_next_track_part(out_part);
            in_part = track_part_queue[1];
        }
        if (in_part.track_index === out_part.track_index) {
            out_part.reset_transitions();
            in_part.reset_transitions();
        } else {
            out_part.transition_out();
            in_part.transition_into();
        }
    };

    const queue_next_track_part = part => {
        const next_part = track_transitions.tracks[track_index][part.next_part];
        next_part.reset();
        track_part_queue.push(next_part);
    };

    const play_track_part = part => {
        stop_playback();
        part.reset();
        track_part_queue.push(part);
        queue_next_track_part(part);
        start_queue_updater();
    };

    const stop_playback = () => {
        clearTimeout(queue_updater_timeout);
        clearTimeout(stream_stopper_timeout);
        queue_updater_timeout = null;
        stream_stopper_timeout = null;
        queue_duration = 0;
        play_start_time = Infinity;

        if (stream_queue.length) {
            for (const stream of stream_queue) {
                stream.cancel();
            }
            stream_queue.splice(0);
        }

        if (track_part_queue.length) {
            track_part_queue.splice(0);
        }
    };

    const input_selector = InputSelector(process_slbgm_from_path, process_slbgm_from_file);

    const timer = Timer(playback_position, is_playing);
    const stream_buttons = StreamButtons(ogg.streams, play_stream);
    const track_controls = TrackControls(get_track_count, get_track_index, change_track);
    const track_list = TrackList(track_labels, track_transitions.tracks, change_track, play_track_part);
    const queue = TrackPartQueue(stream_queue, track_part_queue, track_labels);

    return {
        view() {
            if (!is_file_selected) {
                return m(input_selector);
            }
            if (is_processing_ogg) {
                return m("div", "Loading...");
            }
            return m("fieldset",
                m("legend", ogg.filename),
                m(stream_buttons),
                m(track_list),
                m(queue,
                    m(timer),
                    m("button", { disabled: !is_playing(), onclick: stop_playback }, "Stop")),
                m(track_controls));
        }
    };
};

m.mount(document.body, App);
