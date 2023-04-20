use js_sys::{Float32Array, Uint8Array};
use lewton::header::IdentHeader;
use lewton::inside_ogg::OggStreamReader;
use lewton::VorbisError;
use std::io::Cursor;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{console, DedicatedWorkerGlobalScope, Request, RequestInit, Response};

struct OggStream {
    chunks: Vec<Vec<f32>>,
    duration_secs: f32,
    channels: u32,
    sample_rate: u32,
}

impl OggStream {
    fn new(ident_hdr: &IdentHeader) -> Self {
        return Self {
            chunks: Vec::new(),
            duration_secs: 0.0,
            channels: ident_hdr.audio_channels as u32,
            sample_rate: ident_hdr.audio_sample_rate,
        };
    }

    fn add_chunk(&mut self, chunk: &[i16]) {
        self.chunks
            .push(chunk.iter().map(|x| *x as f32 / 65536.0).collect());
        self.duration_secs += chunk.len() as f32 / (self.sample_rate * self.channels) as f32;
    }

    fn chunk_count(&self) -> u32 {
        return self.chunks.len() as u32;
    }

    fn get_chunk(&self, i: u32) -> Float32Array {
        let chunk = &self.chunks[i as usize];
        let arr = Float32Array::from(chunk.as_slice());
        return arr;
    }
}

async fn download_file(path: &str) -> Result<Vec<u8>, JsValue> {
    let mut opts = RequestInit::new();
    opts.method("GET");
    let request = Request::new_with_str_and_init(path, &opts)?;
    let window: DedicatedWorkerGlobalScope = js_sys::global().dyn_into().unwrap();
    let js_response = JsFuture::from(window.fetch_with_request(&request)).await?;
    assert!(js_response.is_instance_of::<Response>());
    let response: Response = js_response.dyn_into().unwrap();
    let js_buffer = JsFuture::from(response.array_buffer()?).await?;
    let array = Uint8Array::new(&js_buffer);
    return Ok(array.to_vec());
}

fn decode_ogg(file_contents: &[u8]) -> Result<Vec<OggStream>, VorbisError> {
    let mut file_cursor = Cursor::new(file_contents);
    let mut ogg_reader = OggStreamReader::new(&mut file_cursor)?;
    let mut streams = vec![OggStream::new(&ogg_reader.ident_hdr)];

    let mut prev_serial = ogg_reader.stream_serial();
    while let Some(samples) = ogg_reader.read_dec_packet_itl()? {
        if prev_serial != ogg_reader.stream_serial() {
            streams.push(OggStream::new(&ogg_reader.ident_hdr));
        }
        prev_serial = ogg_reader.stream_serial();

        if samples.len() > 0 {
            streams.last_mut().unwrap().add_chunk(&samples);
        }
    }

    return Ok(streams);
}

#[wasm_bindgen]
pub struct OggProcessor {
    streams: Vec<OggStream>,
}

#[wasm_bindgen]
impl OggProcessor {
    pub async fn from_path(path: &str) -> Result<OggProcessor, JsValue> {
        console_error_panic_hook::set_once();
        let file_contents = download_file(path).await?;
        let streams = match decode_ogg(&file_contents) {
            Ok(s) => s,
            Err(err) => return Err(JsValue::from_str(&err.to_string())),
        };
        return Ok(Self { streams });
    }

    pub async fn from_buffer(buf: Uint8Array) -> Result<OggProcessor, JsValue> {
        let file_contents = buf.to_vec();
        let streams = match decode_ogg(&file_contents) {
            Ok(s) => s,
            Err(err) => return Err(JsValue::from_str(&err.to_string())),
        };
        return Ok(Self { streams });
    }

    pub fn get_stream_count(&self) -> u32 {
        return self.streams.len() as u32;
    }

    pub fn get_chunk_count(&self, stream_idx: u32) -> u32 {
        return self.streams[stream_idx as usize].chunk_count();
    }

    pub fn get_channels(&self, stream_idx: u32) -> u32 {
        return self.streams[stream_idx as usize].channels;
    }

    pub fn get_sample_rate(&self, stream_idx: u32) -> u32 {
        return self.streams[stream_idx as usize].sample_rate;
    }

    pub fn get_duration(&self, stream_idx: u32) -> f32 {
        return self.streams[stream_idx as usize].duration_secs;
    }

    pub fn get_chunk(&self, stream_idx: u32, chunk_idx: u32) -> Float32Array {
        return self.streams[stream_idx as usize].get_chunk(chunk_idx);
    }
}
