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
}

export class TrackTransitions {
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

    static from_file(file) {
        const tracks = [];
        return new TrackTransitions(tracks);
    }
}
export const forest_transitions = TrackTransitions.from_values(
    [0, 24, 4, 25, 1, 4, 4, 4, 26, 2, 8, 8, 4, 27, 3, 12, 12, 4, 28, 4, 16, 16, 4, 29, 5, 20, 20, 4, 30, 0],
    [31, 55, 4, 56, 1, 35, 35, 4, 57, 2, 39, 39, 4, 58, 3, 43, 43, 4, 59, 4, 47, 47, 4, 60, 5, 51, 51, 4, 61, 0]);
