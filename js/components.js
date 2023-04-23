import m from "mithril";
import { slbgm_transition_presets, TransitionPart } from "./slbgm";

const nbsp = m.trust("&nbsp;");

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
        const { playback_position, is_playing } = vnode.attrs;
        this.timer_id = requestAnimationFrame(() => this.animate(playback_position, is_playing));
    },
    view() {
        return m("div", `Playback position: ${this.time} sec`);
    }
};

export const StreamButtons = {
    view(vnode) {
        const { streams, play_stream, is_edit_mode_active } = vnode.attrs;

        if (streams.length < 1) {
            return m("div", "No streams");
        }

        return m("fieldset",
            m("legend", "Play individual stream"),
            streams.map((stream, i) => m("button", {
                disabled: is_edit_mode_active(),
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
        const { ondelete, label = "Delete" } = vnode.attrs;

        let class_name = "delete-button";
        if (this.pressed_once) {
            class_name += " delete-button-confirm";
        }

        return m("button", {
            className: class_name,
            disabled: vnode.attrs.disabled,
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
        }, this.pressed_once ? "Really delete?" : label);
    }
};

const TrackPartEditor = {
    edited_part: null,
    inputs_valid: true,
    view(vnode) {
        const {
            form_id,
            part: original_part,
            other_parts,
            stream_count,
            onfinish
        } = vnode.attrs;

        if (!this.edited_part) {
            this.edited_part = {
                part_index: original_part.part_index,
                first_stream: original_part.stream_index,
                last_stream: original_part.stream_index + original_part.part_length - 1,
                next_part: original_part.next_part,
                transition_into_stream: original_part.transition_into_stream,
                transition_out_stream: original_part.transition_out_stream,
            };
        }

        const make_input_field = (field_name, check_validity) => {
            const validate = dom_node => {
                const new_value = parseInt(dom_node.value);
                const error_msg = check_validity(new_value);
                if (error_msg) {
                    dom_node.setCustomValidity(error_msg);
                    this.inputs_valid = false;
                } else {
                    this.inputs_valid = true;
                    dom_node.setCustomValidity("");
                }
            };

            return m("td", m("input", {
                form: form_id,
                type: "text",
                inputmode: "numeric",
                pattern: "\\d*",
                value: this.edited_part[field_name],
                oninput: e => {
                    let new_value = e.target.value;
                    if (new_value) {
                        new_value = parseInt(new_value);
                    }
                    this.edited_part[field_name] = new_value;
                    validate(e.target);
                },
                onchange: e => validate(e.target),
                oncreate: vnode => validate(vnode.dom)
            }));
        };

        const validate_stream = value => {
            const in_range = value >= 0 && value < stream_count;
            if (!in_range) {
                return "Invalid stream number";
            }
        };

        return m("tr.track-part-editor",
            m("th.vertical-header", "Edit"),
            make_input_field("part_index", value => {
                const is_dupe = other_parts.some(other => other.part_index === value);
                if (is_dupe) {
                    return "Duplicate part index";
                }
            }),
            make_input_field("first_stream", value => {
                const invalid_stream = validate_stream(value);
                if (invalid_stream) return invalid_stream;

                if (value > this.edited_part.last_stream) {
                    return "First stream must be less than or equal to last stream";
                }
            }),
            make_input_field("last_stream", value => {
                const invalid_stream = validate_stream(value);
                if (invalid_stream) return invalid_stream;

                if (value < this.edited_part.first_stream) {
                    return "Last stream must be higher than or equal to first stream";
                }
            }),
            make_input_field("next_part", () => { }),
            make_input_field("transition_into_stream", validate_stream),
            make_input_field("transition_out_stream", validate_stream),
            m("td", nbsp),
            m("td", m("input", {
                form: form_id,
                type: "submit",
                value: "Save",
                disabled: !this.inputs_valid,
                onclick: e => {
                    if (e.target.form.checkValidity()) {
                        original_part.part_index = this.edited_part.part_index;
                        original_part.stream_index = this.edited_part.first_stream;
                        original_part.part_length = this.edited_part.last_stream - this.edited_part.first_stream + 1;
                        original_part.transition_into_stream = this.edited_part.transition_into_stream;
                        original_part.transition_out_stream = this.edited_part.transition_out_stream;
                        original_part.next_part = this.edited_part.next_part;
                        onfinish();
                    }
                }
            })),
            m("td", m("button", { onclick: onfinish }, "Cancel")));
    }
};

const TrackPartList = {
    editing_part_index: null,
    view(vnode) {
        const {
            track_index,
            track_parts,
            track_label,
            stream_count,
            change_track,
            play_track_part,
            is_edit_mode_active,
            set_edit_mode_active
        } = vnode.attrs;

        const track_part_editor_form_id = "track-part-editor-form";
        let track_part_editor_form;
        if (this.editing_part_index !== null) {
            track_part_editor_form = m("form", {
                id: track_part_editor_form_id,
                onsubmit: () => false
            });
        }

        let track_part_rows;
        if (track_parts.length < 1) {
            track_part_rows = m("tr", m("td", "No parts"));
        } else {
            track_part_rows = track_parts.map((part, part_index) => {
                const key = `part${track_index}_${part.part_index}`;

                if (this.editing_part_index === part.part_index) {
                    const other_parts = track_parts.filter(other => other.part_index !== part.part_index);
                    return m(TrackPartEditor, {
                        key,
                        form_id: track_part_editor_form_id,
                        part,
                        other_parts,
                        stream_count,
                        onfinish: () => {
                            this.editing_part_index = null;
                            set_edit_mode_active(false);
                        }
                    });
                }

                return m("tr",
                    { key },
                    m("td", nbsp),
                    m("td", String(part.part_index)),
                    m("td", String(part.stream_index)),
                    m("td", String(part.stream_index + part.part_length - 1)),
                    m("td", String(part.next_part)),
                    m("td", String(part.transition_into_stream)),
                    m("td", String(part.transition_out_stream)),
                    m("td", m("button", {
                        disabled: is_edit_mode_active(),
                        onclick: () => {
                            change_track(track_index);
                            play_track_part(part);
                        }
                    }, "Play")),
                    m("td", m("button", {
                        disabled: is_edit_mode_active(),
                        onclick: () => {
                            set_edit_mode_active(true);
                            this.editing_part_index = part.part_index;
                        }
                    }, "Edit")),
                    m("td", m(DeleteButton, {
                        disabled: is_edit_mode_active(),
                        ondelete: () => {
                            track_parts.splice(part_index, 1);
                        }
                    })))
            });
        }

        return m("fieldset.track-part-list",
            { key: "track" + track_index },
            m("legend", `Track ${track_label}`),
            track_part_editor_form,
            m("table.horizontal-table",
                m("tr",
                    m("th", nbsp),
                    m("th", "Part"),
                    m("th", "First stream"),
                    m("th", "Last stream"),
                    m("th", "Next part"),
                    m("th", "Transition into"),
                    m("th", "Transition out"),
                    m("th", "Begin playing track"),
                    m("th", "Edit part"),
                    m("th", "Delete part")),
                track_part_rows,
                m("tr",
                    m("button", {
                        disabled: is_edit_mode_active(),
                        onclick: () => {
                            let max_part_index = 0;
                            for (const part of track_parts) {
                                if (part.part_index > max_part_index) {
                                    max_part_index = part.part_index;
                                }
                            }

                            const new_part_index = max_part_index + 1;
                            const new_part = new TransitionPart(track_index, new_part_index, 0, 0, 1, 0, 0);
                            track_parts.push(new_part);
                            this.editing_part_index = new_part_index;
                            set_edit_mode_active(true);
                        }
                    }, "Add part"))),
            vnode.children);
    }
};

export const TrackList = {
    view(vnode) {
        const {
            tracks,
            stream_count,
            change_track,
            play_track_part,
            is_edit_mode_active,
            set_edit_mode_active
        } = vnode.attrs;

        const track_labels = generate_track_labels(tracks.length);

        let track_part_lists;
        if (tracks.length < 1) {
            track_part_lists = "No tracks";
        } else {
            track_part_lists = track_labels.map((track_label, track_index) => {
                const track_parts = tracks[track_index];
                return m(TrackPartList,
                    {
                        track_index,
                        track_parts,
                        track_label,
                        stream_count,
                        change_track,
                        play_track_part,
                        is_edit_mode_active,
                        set_edit_mode_active
                    },
                    m(DeleteButton, {
                        label: "Delete track",
                        disabled: is_edit_mode_active(),
                        ondelete: () => tracks.splice(track_index, 1)
                    }));
            });
        }

        return m("div.track-list",
            track_part_lists,
            m("button", {
                disabled: is_edit_mode_active(),
                onclick: () => {
                    tracks.push([]);
                }
            }, "Add track"));
    }
};

export const TrackPartQueue = {
    view(vnode) {
        const this_arrow = "↓";
        const not_applicable = () => m("td", "None");

        const { stream_queue, track_part_queue, track_count } = vnode.attrs;

        const track_labels = generate_track_labels(track_count);
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
                m("div", m("label", "(Optional) Track definition file: "),
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
