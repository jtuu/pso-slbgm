import m from "mithril";
import { Ogg, OggWorkerHandler } from "./ogg";
import { TrackTransitions } from "./slbgm";
import { Timer, StreamButtons, TrackControls, TrackList, TrackPartQueue, InputSelector } from "./components";

wasm_bindgen();


function download_file(filename, file_contents) {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(file_contents));
    anchor.setAttribute("download", filename);
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

const App = {
    ogg: new Ogg(),
    audio: null, // Not allowed to construct AudioContext without user gesture
    is_file_selected: false,
    is_processing_ogg: false,
    play_start_time: Infinity,
    queue_duration: 0,
    track_index: 0,
    track_transitions: new TrackTransitions([]),
    track_part_queue: [],
    stream_queue: [],
    queue_updater_timeout: null,
    stream_stopper_timeout: null,
    edit_mode_active: false,

    is_edit_mode_active() {
        return this.edit_mode_active;
    },

    set_edit_mode_active(mode) {
        this.edit_mode_active = mode;
        this.stop_playback();
    },

    init_audio_from_gesture() {
        if (!this.audio) this.audio = new AudioContext();
    },

    async process_slbgm_from_path(file_path, transitions) {
        this.init_audio_from_gesture();
        // One file at a time
        if (this.is_processing_ogg) return Promise.reject();

        const ogg_worker = OggWorkerHandler();
        this.is_file_selected = true;
        this.is_processing_ogg = true;
        this.ogg.filename = file_path;
        await ogg_worker.from_path(this.audio, this.ogg, file_path);
        this.is_processing_ogg = false;
        this.track_transitions.copy_from(transitions);
        m.redraw();
    },

    async process_slbgm_from_file(filename, slbgm_file, transition_file) {
        this.init_audio_from_gesture();
        if (this.is_processing_ogg) return Promise.reject();

        const ogg_worker = OggWorkerHandler();
        this.is_file_selected = true;
        this.is_processing_ogg = true;
        this.ogg.filename = filename;
        const worker_working = ogg_worker.from_file(this.audio, this.ogg, slbgm_file);
        if (transition_file) {
            // Parse transition file while worker is working
            const transitions = await TrackTransitions.from_file(transition_file);
            this.track_transitions.copy_from(transitions);
        }
        await worker_working;
        this.is_processing_ogg = false;
        m.redraw();
    },

    is_playing() {
        if (this.audio && this.ogg.streams.length > 0) {
            return this.audio.currentTime >= this.play_start_time && this.audio.currentTime < this.play_start_time + this.queue_duration;
        }
        return false;
    },

    playback_position() {
        if (this.audio && this.ogg.streams.length > 0) {
            return this.audio.currentTime - this.play_start_time;
        }
        return 0;
    },

    start_queue_updater() {
        let prev_queue_update_time = null;
        let prev_queue_update_duration = 0;
        const update = () => {
            if (this.track_part_queue.length < 1) return;
            if (prev_queue_update_time === null) {
                prev_queue_update_time = this.audio.currentTime;
            }
            let current_part = this.track_part_queue[0];
            if (current_part.current_stream >= current_part.part_length) {
                this.track_part_queue.shift();
                if (this.track_part_queue.length < 1) return;
                current_part = this.track_part_queue[0];
                if (this.track_part_queue.length == 1) {
                    this.queue_next_track_part(current_part);
                }
            }
            const current_stream = this.ogg.streams[current_part.streams[current_part.current_stream]];
            const now = this.audio.currentTime;
            const actually_elapsed = (now - prev_queue_update_time) * 1000;
            const timer_jitter = actually_elapsed - prev_queue_update_duration; // Adapt to timer inaccuracy
            const anticipation = 16; // Update slightly earlier to prevent gaps in this.audio
            const timeout_duration = (current_stream.duration * 1000) + timer_jitter - anticipation;
            prev_queue_update_duration = timeout_duration;
            prev_queue_update_time = now;
            this.queue_stream(current_stream);
            this.queue_updater_timeout = setTimeout(() => {
                current_part.current_stream += 1;
                update();
                m.redraw();
            }, timeout_duration);
        };
        update();
    },

    queue_stream(stream) {
        let when = 0;
        if (this.is_playing()) {
            when = this.queue_duration - (this.audio.currentTime - this.play_start_time);
        } else {
            this.play_start_time = this.audio.currentTime;
            this.queue_duration = 0;
        }
        this.stream_queue.push(stream);
        this.queue_duration += stream.duration;
        stream.queue(this.audio, when);
    },

    play_stream(stream) {
        this.stop_playback();
        this.queue_stream(stream);
        this.stream_stopper_timeout = setTimeout(() => {
            this.stop_playback();
            m.redraw();
        }, stream.duration * 1000);
    },

    get_track_index() {
        return this.track_index;
    },

    get_track_count() {
        return this.track_transitions.tracks.length;
    },

    change_track(i) {
        if (i == this.track_index) return;

        this.track_index = i;
        this.track_index %= this.track_transitions.tracks.length;

        if (this.track_part_queue.length < 1) return;

        const current_part = this.track_part_queue[0];
        let out_part;
        let in_part;
        // Can't transition if last stream is already playing, use next in queue
        if (current_part.current_stream >= current_part.part_length - 1) {
            out_part = this.track_part_queue[1];
            this.track_part_queue.splice(2);
            this.queue_next_track_part(out_part);
            in_part = this.track_part_queue[2];
        } else {
            out_part = this.track_part_queue[0];
            this.track_part_queue.splice(1);
            this.queue_next_track_part(out_part);
            in_part = this.track_part_queue[1];
        }
        if (in_part.track_index === out_part.track_index) {
            out_part.reset_transitions();
            in_part.reset_transitions();
        } else {
            out_part.transition_out();
            in_part.transition_into();
        }
    },

    queue_next_track_part(part) {
        const next_part = this.track_transitions.tracks[this.track_index][part.next_part];
        next_part.reset();
        this.track_part_queue.push(next_part);
    },

    play_track_part(part) {
        this.stop_playback();
        part.reset();
        this.track_part_queue.push(part);
        this.queue_next_track_part(part);
        this.start_queue_updater();
    },

    stop_playback() {
        clearTimeout(this.queue_updater_timeout);
        clearTimeout(this.stream_stopper_timeout);
        this.queue_updater_timeout = null;
        this.stream_stopper_timeout = null;
        this.queue_duration = 0;
        this.play_start_time = Infinity;

        if (this.stream_queue.length) {
            for (const stream of this.stream_queue) {
                stream.cancel();
            }
            this.stream_queue.splice(0);
        }

        if (this.track_part_queue.length) {
            this.track_part_queue.splice(0);
        }
    },

    view() {
        if (!this.is_file_selected) {
            return m(InputSelector, {
                process_slbgm_from_path: this.process_slbgm_from_path.bind(this),
                process_slbgm_from_file: this.process_slbgm_from_file.bind(this)
            });
        }
        if (this.is_processing_ogg) {
            return m("div", "Loading...");
        }
        return m("fieldset",
            m("legend", this.ogg.filename),
            m(StreamButtons, {
                play_stream: this.play_stream.bind(this),
                streams: this.ogg.streams,
                is_edit_mode_active: this.is_edit_mode_active.bind(this)
            }),
            m(TrackList, {
                tracks: this.track_transitions.tracks,
                stream_count: this.ogg.streams.length,
                change_track: this.change_track.bind(this),
                play_track_part: this.play_track_part.bind(this),
                is_edit_mode_active: this.is_edit_mode_active.bind(this),
                set_edit_mode_active: this.set_edit_mode_active.bind(this)
            }),
            m(TrackPartQueue, {
                stream_queue: this.stream_queue,
                track_part_queue: this.track_part_queue,
                track_count: this.track_transitions.tracks.length
            },
                m(Timer, {
                    playback_position: this.playback_position.bind(this),
                    is_playing: this.is_playing.bind(this)
                }),
                m("button", {
                    disabled: !this.is_playing(),
                    onclick: this.stop_playback.bind(this)
                }, "Stop")),
            m(TrackControls, {
                get_track_count: this.get_track_count.bind(this),
                get_track_index: this.get_track_index.bind(this),
                change_track: this.change_track.bind(this)
            }),
            m("button", {
                disabled: this.is_edit_mode_active(),
                onclick: () => {
                    const filename_no_ext = this.ogg.filename.split(".")[0];
                    const out_filename = filename_no_ext + "_tracks.txt";
                    const file_contents = this.track_transitions.to_text_format();
                    download_file(out_filename, file_contents);
                }
            }, "Export track definitions"));
    }
};

m.mount(document.body, App);
