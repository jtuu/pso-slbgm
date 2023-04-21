importScripts("./pkg/index.js");

const {OggProcessor} = wasm_bindgen;

function send_results(ogg_processor) {
    const stream_count = ogg_processor.get_stream_count();
    self.postMessage(stream_count);
    for (let stream_idx = 0; stream_idx < stream_count; stream_idx++) {
        const chunk_count = ogg_processor.get_chunk_count(stream_idx);
        const channels = ogg_processor.get_channels(stream_idx);
        const sample_rate = ogg_processor.get_sample_rate(stream_idx);
        const duration = ogg_processor.get_duration(stream_idx);
        self.postMessage([chunk_count, channels, sample_rate, duration].join(","));
        for (let chunk_idx = 0; chunk_idx < chunk_count; chunk_idx++) {
            const chunk = ogg_processor.get_chunk(stream_idx, chunk_idx);
            self.postMessage(chunk.buffer, [chunk.buffer]);
        }
    }
}

function read_file(file) {
    const reader = new FileReader();
    const result = new Promise((resolve, reject) => {
        reader.onerror = reject;
        reader.onabort = reject;
        reader.onload = () => resolve(reader.result);
    });
    reader.readAsArrayBuffer(file);
    return result;
}

async function init_wasm_in_worker() {
    const wasm_loading = wasm_bindgen('./pkg/index_bg.wasm');

    self.onmessage = async event => {
        switch (event.data.message_type) {
            case "BeginFromPath":
                {
                    await wasm_loading;
                    const ogg_processor = await OggProcessor.from_path(event.data.file_path);
                    send_results(ogg_processor);
                }
                break;
            case "BeginFromFile":
                {
                    await wasm_loading;
                    const buf = new Uint8Array(await read_file(event.data.file, true));
                    const ogg_processor = await OggProcessor.from_buffer(buf);
                    send_results(ogg_processor);
                }
                break;
        }
    };
};

init_wasm_in_worker();
