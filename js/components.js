import m from "mithril";

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

export const Timer = (playback_position, is_playing) => () => {
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

export const StreamButtons = (streams, play_stream) => {
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

export const TrackControls = (get_track_count, get_track_index, change_track) => {
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

            let tracks;
            if (track_count < 1) {
                tracks = m("div", "No tracks");
            } else {
                button_labels.map((label, i) => m("button", {
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
};

export const TrackPartList = (track_index, track_label, parts, change_track, play_track_part) => {
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

export const TrackPartQueue = (stream_queue, part_queue, track_labels) => {
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

export const InputSelector = (presets, process_slbgm_from_path, process_slbgm_from_file) => {
    let selected_slbgm_file = null;
    let selected_slbgm_filename = null;
    let selected_transition_file = null;
    return {
        view() {
            return m("fieldset",
                m("legend", "Choose input"),
                m("fieldset",
                    m("legend", "Preset"),
                    presets.map(({ file_path, transitions }) => {
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
                                selected_slbgm_file = e.target.files[0];
                                const path_parts = e.target.value.split(/\/|\\/);
                                selected_slbgm_filename = path_parts[path_parts.length - 1];
                            }
                        })),
                    m("div", m("label", "(Optional) transition definition file: "),
                        m("input", {
                            type: "file",
                            accept: ".txt",
                            onchange: e => selected_transition_file = e.target.files[0]
                        })),
                    m("button", {
                        disabled: !selected_slbgm_file,
                        onclick: () => process_slbgm_from_file(selected_slbgm_filename, selected_slbgm_file, selected_transition_file)
                    }, "Load selected")));
        }
    };
};
