import m from "mithril";
import { slbgm_transition_presets } from "./slbgm";

export function generate_track_labels(track_count) {
    if (track_count == 2) {
        return ["Peaceful", "Combat"];
    }

    const labels = [];
    for (let i = 0; i < track_count; i++) {
        labels.push(String(i));
    }
    return labels;
}

export const Timer = {
    time: "0.0",
    timer_id: null,
    animate(playback_position, is_playing) {
        if (is_playing()) {
            this.time = playback_position().toFixed(1);
        }
        m.redraw();
        this.timer_id = requestAnimationFrame(() => this.animate(playback_position, is_playing));
    },
    onremove() {
        cancelAnimationFrame(this.timer_id);
    },
    oncreate(vnode) {
        const {playback_position, is_playing} = vnode.attrs;
        this.timer_id = requestAnimationFrame(() => this.animate(playback_position, is_playing));
    },
    view() {
        return m("div", `Playback position: ${this.time} sec`);
    }
};

export const StreamButtons = {
    view(vnode) {
        const { streams, play_stream } = vnode.attrs;

        if (streams.length < 1) {
            return m("div", "No streams");
        }

        return m("fieldset",
            m("legend", "Play individual stream"),
            streams.map((stream, i) => m("button", {
                onclick: () => {
                    play_stream(stream);
                }
            }, String(i))));
    }
};

export const TrackControls = {
    view(vnode) {
        const { get_track_count, get_track_index, change_track } = vnode.attrs;

        const track_count = get_track_count();
        const track_index = get_track_index();
        const button_labels = generate_track_labels(track_count);

        let current_track_label;
        if (track_count == 2) {
            current_track_label = track_index == 0 ? "Peaceful" : "Combat";
        } else {
            current_track_label = String(track_index);
        }

        let tracks;
        if (track_count < 1) {
            tracks = m("div", "No tracks");
        } else {
            tracks = button_labels.map((label, i) => m("button", {
                disabled: i == track_index,
                onclick: () => change_track(i)
            }, label));
        }

        return m("fieldset",
            m("legend", "Current track: " + current_track_label),
            m("div", "Transition to track: ",
                tracks));
    }
};

const DeleteButton = {
    pressed_once: false,
    view(vnode) {
        const { ondelete } = vnode.attrs;

        return m("button", {
            className: this.pressed_once ? "delete-button-confirm" : "delete-button",
            onclick: () => {
                if (this.pressed_once) {
                    ondelete();
                } else {
                    this.pressed_once = true;
                }
            },
            onmouseleave: () => {
                this.pressed_once = false;
            }
        }, this.pressed_once ? "Really delete?" : "Delete");
    }
};

const TrackPartList = {
    view(vnode) {
        const { track_index, track_parts, track_label, change_track, play_track_part } = vnode.attrs;

        return m("fieldset",
            { key: "track" + track_index },
            m("legend", `Track ${track_label}`),
            m("table.horizontal-table",
                m("tr",
                    m("th", "Part"),
                    m("th", "First stream"),
                    m("th", "Last stream"),
                    m("th", "Next part"),
                    m("th", "Transition into"),
                    m("th", "Transition out"),
                    m("th", "Begin playing track"),
                    m("th", "Delete part")),
                track_parts.map((part, part_index) => {
                    return m("tr",
                        { key: `part${track_index}_${part.part_index}` },
                        m("td", String(part.part_index)),
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
                        }, "Play")),
                        m("td", m(DeleteButton, {
                            ondelete: () => {
                                track_parts.splice(part_index, 1);
                            }
                        })))
                })));
    }
};

export const TrackList = {
    view(vnode) {
        const { track_labels, tracks, change_track, play_track_part } = vnode.attrs;

        let track_part_lists;
        if (track_labels.length < 1) {
            track_part_lists = "No tracks";
        } else {
            track_part_lists = track_labels.map((track_label, track_index) => {
                const track_parts = tracks[track_index];
                return m(TrackPartList, { track_index, track_parts, track_label, change_track, play_track_part });
            });
        }

        return m("div.track-list", track_part_lists);
    }
};

export const TrackPartQueue = {
    view(vnode) {
        const nbsp = m.trust("&nbsp;");
        const this_arrow = "↓";
        const not_applicable = () => m("td", "None");

        const { stream_queue, track_part_queue, track_labels } = vnode.attrs;

        const has_streams = stream_queue.length > 0;
        const has_parts = track_part_queue.length > 0;
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
            rows = track_part_queue.flatMap((part, queue_idx) => {
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

export const InputSelector = {
    selected_slbgm_file: null,
    selected_slbgm_filename: null,
    selected_transition_file: null,
    view(vnode) {
        const { process_slbgm_from_path, process_slbgm_from_file } = vnode.attrs;

        return m("fieldset",
            m("legend", "Choose input"),
            m("fieldset",
                m("legend", "Preset"),
                slbgm_transition_presets.map(({ file_path, transitions }) => {
                    return m("button", {
                        onclick: () => process_slbgm_from_path(file_path, transitions).then(() => m.redraw())
                    }, "Load " + file_path)
                })),
            m("fieldset",
                m("legend", "Local file"),
                m("div", m("label", "slbgm ogg file: "),
                    m("input", {
                        type: "file",
                        accept: ".ogg",
                        onchange: e => {
                            this.selected_slbgm_file = e.target.files[0];
                            const path_parts = e.target.value.split(/\/|\\/);
                            this.selected_slbgm_filename = path_parts[path_parts.length - 1];
                        }
                    })),
                m("div", m("label", "(Optional) transition definition file: "),
                    m("input", {
                        type: "file",
                        accept: ".txt",
                        onchange: e => this.selected_transition_file = e.target.files[0]
                    })),
                m("button", {
                    disabled: !this.selected_slbgm_file,
                    onclick: () => process_slbgm_from_file(this.selected_slbgm_filename, this.selected_slbgm_file, this.selected_transition_file)
                }, "Load selected")));
    }
};
