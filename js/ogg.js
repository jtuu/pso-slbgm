export class OggStream {
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

export class Ogg {
    constructor() {
        this.filename = "";
        this.stream_count = 0;
        this.currently_playing_stream = 0;
        this.play_start_time = 0;
        this.streams = [];
    }
}

export const OggWorkerHandler = () => {
    const worker = new Worker("./ogg-worker.js");

    const worker_message_handlers = {
        done: () => () => { },
        receiving_stream_count: (audio, ogg, done_callback) => event => {
            const stream_count = parseInt(event.data);
            ogg.stream_count = stream_count;
            worker.onmessage = worker_message_handlers.receiving_chunk_count(audio, ogg, done_callback);
        },
        receiving_chunk_count: (audio, ogg, done_callback) => event => {
            const [chunk_count, channels, sample_rate, duration] = event.data.split(",");
            let stream_offset = 0;
            if (ogg.streams.length > 0) {
                const prev_stream = ogg.streams[ogg.streams.length - 1];
                stream_offset = prev_stream.offset + prev_stream.duration;
            }
            const stream_idx = ogg.streams.length;
            const stream = new OggStream(stream_idx, parseInt(chunk_count), parseInt(channels), parseInt(sample_rate), parseFloat(duration), stream_offset);
            ogg.streams.push(stream);
            worker.onmessage = worker_message_handlers.receiving_chunks(audio, ogg, stream, done_callback);
        },
        receiving_chunks: (audio, ogg, stream, done_callback) => event => {
            stream.add_chunk(audio, event.data);
            // Check if stream end or file end
            if (stream.chunks.length >= stream.chunk_count) {
                if (ogg.streams.length >= ogg.stream_count) {
                    done_callback(ogg);
                    worker.onmessage = worker_message_handlers.done();
                } else {
                    worker.onmessage = worker_message_handlers.receiving_chunk_count(audio, ogg, done_callback);
                }
            }
        }
    };

    return {
        from_path(audio, ogg, file_path) {
            return new Promise((resolve, reject) => {
                worker.onmessage = worker_message_handlers.receiving_stream_count(audio, ogg, resolve);
                worker.postMessage({ message_type: "BeginFromPath", file_path: file_path });
            });
        }
    };
};
