import * as m from "mithril";

const wasm_loading = wasm_bindgen();

class OggStream {
    constructor(index, chunk_count, channels, sample_rate, duration, offset) {
        this.index = index;
        this.chunks = [];
        this.audio_nodes = [];
        this.chunk_count = chunk_count;
        this.channels = channels;
        this.sample_rate = sample_rate;
        this.duration = duration;
        this.offset = offset;
    }

    add_chunk(audio, chunk) {
        // Convert float array to AudioBuffer
        const samples = new Float32Array(chunk);
        const audio_buffer = audio.createBuffer(this.channels, samples.length / this.channels, this.sample_rate);
        for (let channel_idx = 0; channel_idx < this.channels; channel_idx++) {
            // Source has interleaved channels but AudioBuffer wants them separate
            const channel_dst_buf = audio_buffer.getChannelData(channel_idx);
            for (let sample_idx = 0; sample_idx < samples.length; sample_idx += this.channels) {
                const channel_sample = samples[sample_idx + channel_idx];
                channel_dst_buf[sample_idx / this.channels] = channel_sample;
            }
        }
        this.chunks.push(audio_buffer);
    }

    queue(audio, when) {
        let start = when;
        let current = audio.currentTime;
        this.audio_nodes.splice(0);
        for (const buffer of this.chunks) {
            const node = audio.createBufferSource();
            node.buffer = buffer;
            node.connect(audio.destination);
            node.start(current + start);
            this.audio_nodes.push(node);
            start += buffer.length / this.sample_rate;
        }
    }

    cancel() {
        for (const node of this.audio_nodes) {
            node.disconnect();
        }
    }
}

class Ogg {
    constructor() {
        this.filename = "";
        this.stream_count = 0;
        this.currently_playing_stream = 0;
        this.play_start_time = 0;
        this.streams = [];
    }
}

const worker_message_handlers = {
    empty: () => { },
    receiving_stream_count: (worker, audio, ogg, done_callback) => event => {
        const stream_count = parseInt(event.data);
        ogg.stream_count = stream_count;
        worker.onmessage = worker_message_handlers.receiving_chunk_count(worker, audio, ogg, done_callback);
    },
    receiving_chunk_count: (worker, audio, ogg, done_callback) => event => {
        const [chunk_count, channels, sample_rate, duration] = event.data.split(",");
        let stream_offset = 0;
        if (ogg.streams.length > 0) {
            const prev_stream = ogg.streams[ogg.streams.length - 1];
            stream_offset = prev_stream.offset + prev_stream.duration;
        }
        const stream_idx = ogg.streams.length;
        const stream = new OggStream(stream_idx, parseInt(chunk_count), parseInt(channels), parseInt(sample_rate), parseFloat(duration), stream_offset);
        ogg.streams.push(stream);
        worker.onmessage = worker_message_handlers.receiving_chunks(worker, audio, ogg, stream, done_callback);
    },
    receiving_chunks: (worker, audio, ogg, stream, done_callback) => event => {
        stream.add_chunk(audio, event.data);
        // Check if stream end or file end
        if (stream.chunks.length >= stream.chunk_count) {
            if (ogg.streams.length >= ogg.stream_count) {
                done_callback(ogg);
                worker.onmessage = worker_message_handlers.empty();
            } else {
                worker.onmessage = worker_message_handlers.receiving_chunk_count(worker, audio, ogg, done_callback);
            }
        }
    }
};

const Timer = (playback_position, is_playing) => () => {
    let time = "0.0";
    const animate = () => {
        if (is_playing()) {
            time = playback_position().toFixed(1);
        }
        m.redraw();
        requestAnimationFrame(animate);
    };
    return {
        oncreate() {
            requestAnimationFrame(animate);
        },
        view() {
            return m("div", `Playback position: ${time} sec`);
        }
    };
};

const StreamButtons = (streams, play_stream) => {
    return {
        view() {
            if (streams.length < 1) {
                return m("div", "No streams");
            }
            return m("fieldset",
                m("legend", "Play individual stream"),
                streams.map((stream, i) => m("button", {
                    onclick: () => {
                        play_stream(stream);
                    }
                }, i)));
        }
    };
};

function generate_track_labels(track_count) {
    if (track_count == 2) {
        return ["Peaceful", "Combat"];
    }

    const labels = [];
    for (let i = 0; i < track_count; i++) {
        labels.push(String(i));
    }
    return labels;
}

const TrackControls = (get_track_count, get_track_index, change_track) => {
    return {
        view() {
            const track_count = get_track_count();
            const track_index = get_track_index();
            const button_labels = generate_track_labels(track_count);
            let current_track_label = "";
            if (track_count == 2) {
                current_track_label = track_index == 0 ? "Peaceful" : "Combat";
            } else {
                current_track_label = String(track_index);
            }
            return m("fieldset",
                m("legend", "Current track: " + current_track_label),
                m("div", "Transition to track: ",
                    button_labels.map((label, i) => m("button", {
                        disabled: i == track_index,
                        onclick: () => change_track(i)
                    }, label))));
        }
    };
};

const TrackPartList = (track_index, track_label, parts, change_track, play_track_part) => {
    return {
        view() {
            return m("fieldset",
                m("legend", `Track ${track_label}`),
                m("table.horizontal-table",
                    m("tr",
                        m("th", "#"),
                        m("th", "First stream"),
                        m("th", "Last stream"),
                        m("th", "Next part"),
                        m("th", "Transition into"),
                        m("th", "Transition out"),
                        m("th", "Begin playing track")),
                    parts.map((part, i) => {
                        return m("tr",
                            m("td", String(i)),
                            m("td", String(part.stream_index)),
                            m("td", String(part.stream_index + part.part_length - 1)),
                            m("td", String(part.next_part)),
                            m("td", String(part.transition_into_stream)),
                            m("td", String(part.transition_out_stream)),
                            m("td", m("button", {
                                onclick: () => {
                                    change_track(track_index);
                                    play_track_part(part);
                                }
                            }, "Play")))
                    })));
        }
    };
};

const TrackPartQueue = (stream_queue, part_queue, track_labels) => {
    const nbsp = m.trust("&nbsp;");
    const this_arrow = "↓";
    const not_applicable = () => m("td", "None");
    return {
        view(vnode) {
            const has_streams = stream_queue.length > 0;
            const has_parts = part_queue.length > 0;
            const stopped = !has_parts && !has_streams;

            let rows;
            if (stopped) {
                rows = [
                    m("tr",
                        m("td", nbsp),
                        not_applicable(),
                        not_applicable(),
                        not_applicable(),
                        not_applicable())];
            } else if (has_parts) {
                rows = part_queue.flatMap((part, queue_idx) => {
                    const elements = [];
                    const start = part.current_stream;
                    for (let i = start; i < part.streams.length; i++) {
                        const position_label = queue_idx == 0 && i == start ? this_arrow : nbsp;
                        const stream_index = part.streams[i];
                        let transition_label = "Continue";
                        if (part.is_transitioning_into && i == 0) {
                            transition_label = "In";
                        } else if (part.is_transitioning_out && i == part.streams.length - 1) {
                            transition_label = "Out";
                        }
                        elements.push(m("tr",
                            m("td", position_label),
                            m("td", track_labels[part.track_index]),
                            m("td", String(part.part_index)),
                            m("td", String(stream_index)),
                            m("td", transition_label)));
                    }
                    return elements;
                });
            } else if (has_streams) {
                const stream = stream_queue[stream_queue.length - 1];
                rows = [
                    m("tr",
                        m("td", this_arrow),
                        not_applicable(),
                        not_applicable(),
                        m("td", String(stream.index)),
                        not_applicable())];
            }

            const table = m("table.horizontal-table",
                m("tr",
                    m("th", nbsp),
                    m("th", "Track"),
                    m("th", "Part"),
                    m("th", "Stream"),
                    m("th", "Transition")),
                rows);
            
            const status_label = stopped ? "Stopped" : "Playing";
            return m("fieldset",
                m("legend", "Playback queue"),
                table,
                m("div", "Status: " + status_label),
                vnode.children);
        }
    };
};

class TransitionPart {
    constructor(track_index, part_index, stream_index, trans_into, part_length, trans_out, next_part) {
        this.track_index = track_index;
        this.part_index = part_index;
        this.stream_index = stream_index;
        this.transition_into_stream = trans_into;
        this.part_length = part_length;
        this.transition_out_stream = trans_out;
        this.next_part = next_part;
        this.streams = [];

        this.reset();
    }

    reset() {
        this.is_transitioning_into = false;
        this.is_transitioning_out = false;
        this.current_stream = 0;
        this.streams.splice(0);
        for (let i = this.stream_index; i < this.stream_index + this.part_length; i++) {
            this.streams.push(i);
        }
    }

    transition_into() {
        this.is_transitioning_into = true;
        this.streams[0] = this.transition_into_stream;
    }

    transition_out() {
        this.is_transitioning_out = true;
        this.streams[this.streams.length - 1] = this.transition_out_stream;
    }

    reset_transitions() {
        this.is_transitioning_into = false;
        this.is_transitioning_out = false;
        this.streams[0] = this.stream_index;
        this.streams[this.streams.length - 1] = this.stream_index + this.part_length - 1;
    }
}

class TrackTransitions {
    constructor(tracks) {
        this.tracks = tracks;
    }

    static from_values(peaceful, combat) {
        const tracks = [];
        for (const [track_index, track_data] of [peaceful, combat].entries()) {
            const track_parts = [];
            tracks.push(track_parts);

            for (let i = 0; i < track_data.length; i += 5) {
                const part_index = track_parts.length;
                const part = new TransitionPart(
                    track_index,
                    part_index,
                    track_data[i + 0],
                    track_data[i + 1],
                    track_data[i + 2],
                    track_data[i + 3],
                    track_data[i + 4]
                );
                track_parts.push(part);
            }
        }
        return new TrackTransitions(tracks);
    }
}
const forest_transitions = TrackTransitions.from_values(
    [0, 24, 4, 25, 1, 4, 4, 4, 26, 2, 8, 8, 4, 27, 3, 12, 12, 4, 28, 4, 16, 16, 4, 29, 5, 20, 20, 4, 30, 0],
    [31, 55, 4, 56, 1, 35, 35, 4, 57, 2, 39, 39, 4, 58, 3, 43, 43, 4, 59, 4, 47, 47, 4, 60, 5, 51, 51, 4, 61, 0]);

const App = () => {
    const ogg_worker = new Worker("./ogg-worker.js");
    const ogg = new Ogg();
    let audio = null; // Not allowed to construct AudioContext without user gesture
    let is_file_selected = false;
    let is_processing_ogg = false;
    let play_start_time = Infinity;
    let queue_duration = 0;
    let track_index = 0;
    let track_transitions = forest_transitions;
    const track_part_queue = [];
    const stream_queue = [];
    let queue_updater_timeout = null;
    let stream_stopper_timeout = null;

    const process_ogg_from_path = file_path => {
        if (!audio) audio = new AudioContext();
        // One file at a time
        if (is_processing_ogg) return Promise.reject();

        is_file_selected = true;
        is_processing_ogg = true;
        return new Promise((resolve, reject) => {
            ogg_worker.onmessage = worker_message_handlers.receiving_stream_count(ogg_worker, audio, ogg, resolve);
            ogg_worker.postMessage({ message_type: "BeginFromPath", file_path: file_path });
            ogg.filename = file_path;
        }).then(() => {
            is_processing_ogg = false;
        });
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

    const timer = Timer(playback_position, is_playing);
    const stream_buttons = StreamButtons(ogg.streams, play_stream);
    const track_controls = TrackControls(get_track_count, get_track_index, change_track);

    const track_labels = generate_track_labels(track_transitions.tracks.length);
    const track_part_lists = track_labels.map((track_label, i) => {
        const track_parts = track_transitions.tracks[i];
        return m(TrackPartList(i, track_label, track_parts, change_track, play_track_part, is_playing));
    });

    const queue = TrackPartQueue(stream_queue, track_part_queue, track_labels);

    return {
        view() {
            if (!is_file_selected) {
                const file_path = "slbgm_forest.ogg";
                return m("button", {
                    onclick: () => process_ogg_from_path(file_path).then(() => m.redraw())
                }, "Load " + file_path);
            }
            if (is_processing_ogg) {
                return m("div", "Loading...");
            }
            return m("fieldset",
                m("legend", ogg.filename),
                m(stream_buttons),
                m(track_controls),
                m("div.track-list", track_part_lists),
                m(queue,
                    m(timer),
                    m("button", { disabled: !is_playing(), onclick: stop_playback }, "Stop")));
        }
    };
};

m.mount(document.body, App);
