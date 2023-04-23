function read_file(file) {
    const reader = new FileReader();
    const result = new Promise((resolve, reject) => {
        reader.onerror = reject;
        reader.onabort = reject;
        reader.onload = () => resolve(reader.result);
    });
    reader.readAsText(file);
    return result;
}

export class TransitionPart {
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

    clone() {
        return new TransitionPart(
            this.track_index,
            this.part_index,
            this.stream_index,
            this.transition_into_stream,
            this.part_length,
            this.transition_out_stream,
            this.next_part);
    }
}

export class TrackTransitions {
    constructor(tracks) {
        this.tracks = tracks;
    }

    copy_from(other) {
        this.tracks.splice(0, this.tracks.length, ...other.tracks);
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

    static async from_file(file) {
        const file_contents = await read_file(file, false);
        return TrackTransitions.from_file_contents(file_contents);
    }

    static from_file_contents(file_contents) {
        const tracks = [];

        for (const line of file_contents.split("\n")) {
            const line_parts = line.split(",");
            if (line_parts.length < 6) continue;

            const track_index = parseInt(line_parts[0]);
            const start_index = parseInt(line_parts[1]);
            const trans_in = parseInt(line_parts[2]);
            const part_length = parseInt(line_parts[3]);
            const trans_out = parseInt(line_parts[4]);
            const next_part = parseInt(line_parts[5]);

            let track_parts;
            if (tracks.length <= track_index) {
                track_parts = [];
                tracks.push(track_parts);
            } else {
                track_parts = tracks[track_index];
            }

            const part_index = track_parts.length;
            
            track_parts.push(new TransitionPart(
                track_index,
                part_index,
                start_index,
                trans_in,
                part_length,
                trans_out,
                next_part
            ));
        }

        return new TrackTransitions(tracks);
    }

    to_text_format() {
        let result = "";
        for (const track of this.tracks) {
            const parts = track.sort((a, b) => a.part_index - b.part_index);
            for (const part of parts) {
                const cells = [
                    part.track_index,
                    part.stream_index,
                    part.transition_into_stream,
                    part.part_length,
                    part.transition_out_stream,
                    part.next_part
                ];
                const row = cells.join(",") + "\n";
                result += row;
            }
        }

        return result;
    }
}

const forest_preset = {
    file_path: "slbgm_forest.ogg", transitions: TrackTransitions.from_file_contents(`0,0,24,4,25,1
1,31,55,4,56,1
0,4,4,4,26,2
1,35,35,4,57,2
0,8,8,4,27,3
1,39,39,4,58,3
0,12,12,4,28,4
1,43,43,4,59,4
0,16,16,4,29,5
1,47,47,4,60,5
0,20,20,4,30,0
1,51,51,4,61,0`)
};

const cave_preset = {
    file_path: "slbgm_cave.ogg", transitions: TrackTransitions.from_file_contents(`0,0,24,4,25,1
1,31,55,4,56,1
0,4,4,4,26,2
1,35,35,4,57,2
0,8,8,4,27,3
1,39,39,4,58,3
0,12,12,4,28,4
1,43,43,4,59,4
0,16,16,4,29,5
1,47,47,4,60,5
0,20,20,4,30,0
1,51,51,4,61,0`)
};

const machine_preset = {
    file_path: "slbgm_machine.ogg", transitions: TrackTransitions.from_file_contents(`0,0,20,4,21,1
1,26,46,4,47,1
0,4,4,4,22,2
1,30,30,4,48,2
0,8,8,4,23,3
1,34,34,4,49,3
0,12,12,4,24,4
1,38,38,4,50,4
0,16,16,4,25,0
1,42,42,4,51,0`)
};

const ancient_preset = {
    file_path: "slbgm_ancient.ogg", transitions: TrackTransitions.from_file_contents(`0,0,0,4,24,1
1,30,49,4,50,1
0,4,23,4,25,2
1,30,49,4,50,2
0,8,8,2,26,3
1,34,34,2,51,3
0,10,10,4,27,4
1,36,36,4,52,4
0,14,14,5,28,5
1,40,40,5,53,5
0,19,19,4,29,1
1,45,45,4,54,1`)
};

const dark_preset = {
    file_path: "slbgm_dark.ogg", transitions: TrackTransitions.from_file_contents(`0,0,0,2,65535,1
1,13,21,8,65535,0
0,2,12,10,65535,1
1,13,21,8,65535,0`)
};

const jungle_preset = {
    file_path: "slbgm_jungle.ogg", transitions: TrackTransitions.from_file_contents(`0,7,35,4,0,1
1,36,64,4,65,1
0,11,11,4,1,2
1,40,40,4,66,2
0,15,15,4,2,3
1,44,44,4,67,3
0,19,19,4,3,4
1,48,48,4,68,4
0,23,23,4,4,5
1,52,52,4,69,5
0,27,27,4,5,6
1,56,56,4,70,6
0,31,31,4,6,0
1,60,60,4,71,0`)
};

const seabed_preset = {
    file_path: "slbgm_seabed.ogg", transitions: TrackTransitions.from_file_contents(`0,0,0,4,27,1
1,33,33,4,60,1
0,4,26,4,28,2
1,37,59,4,61,2
0,8,8,4,29,3
1,41,41,4,62,3
0,12,12,4,30,4
1,45,45,4,63,4
0,16,16,4,31,5
1,49,49,4,64,5
0,20,20,6,32,1
1,53,53,6,65,1`)
};

const ruin_preset = {
    file_path: "slbgm_ruin.ogg", transitions: TrackTransitions.from_file_contents(`0,0,22,2,23,1
1,30,52,2,53,1
0,2,2,4,24,2
1,32,32,4,54,2
0,6,6,2,25,3
1,36,36,2,55,3
0,8,8,4,26,4
1,38,38,4,56,4
0,12,12,2,27,5
1,42,42,2,57,5
0,14,14,4,28,6
1,44,44,4,58,6
0,18,18,4,29,0
1,48,48,4,59,0`)
};

const space_preset = {
    file_path: "slbgm_space.ogg", transitions: TrackTransitions.from_file_contents(`0,0,0,4,29,1
1,41,65,4,66,1
0,4,28,4,30,2
1,41,65,4,66,2
0,8,8,2,31,3
1,45,45,2,67,3
0,10,10,4,32,4
1,47,47,4,68,4
0,14,14,2,33,5
1,51,51,2,69,5
0,16,16,4,34,6
1,53,53,4,70,6
0,20,20,4,35,7
1,57,57,4,71,7
0,24,24,4,36,1
1,61,61,4,72,1`)
};

const wilds_preset = {
    file_path: "slbgm_wilds.ogg", transitions: TrackTransitions.from_file_contents(`0,37,38,1,29,1
1,0,1,1,66,1
0,39,39,3,29,2
1,2,2,3,66,2
0,42,42,4,30,3
1,5,5,4,67,3
0,46,46,4,31,4
1,9,9,4,68,4
0,50,50,4,32,5
1,13,13,4,69,5
0,54,54,4,33,6
1,17,17,4,70,6
0,58,58,2,34,7
1,21,21,2,71,7
0,60,60,4,35,8
1,23,23,4,72,8
0,64,64,2,36,0
1,27,27,2,73,0`)
};

const crater_preset = {
    file_path: "slbgm_crater.ogg", transitions: TrackTransitions.from_file_contents(`0,24,25,1,19,1
1,0,1,1,43,1
0,26,26,3,19,2
1,2,2,3,43,2
0,29,29,4,20,3
1,5,5,4,44,3
0,33,33,4,21,4
1,9,9,4,45,4
0,37,37,4,22,5
1,13,13,4,46,5
0,41,41,2,23,0
1,17,17,2,47,0`)
};

const desert_preset = {
    file_path: "slbgm_desert.ogg", transitions: TrackTransitions.from_file_contents(`0,40,41,1,33,1
1,0,1,1,73,1
0,42,42,3,33,2
1,2,2,3,73,2
0,45,45,4,34,3
1,5,5,4,74,3
0,49,49,4,35,4
1,9,9,4,75,4
0,53,53,4,36,5
1,13,13,4,76,5
0,57,57,4,37,6
1,17,17,4,77,6
0,61,61,4,38,7
1,21,21,4,78,7
0,65,65,8,39,0
1,25,25,8,79,0`)
};

export const slbgm_transition_presets = [
    forest_preset,
    cave_preset,
    machine_preset,
    ancient_preset,
    dark_preset,
    jungle_preset,
    seabed_preset,
    ruin_preset,
    space_preset,
    wilds_preset,
    crater_preset,
    desert_preset
];
