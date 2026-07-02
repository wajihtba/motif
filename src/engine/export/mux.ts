// Encoder + muxer selection. H.264/mp4 is the primary target (plays
// everywhere Instagram does); VP9/WebM is a FIRST-CLASS fallback because
// H.264 encode is unavailable on some Linux/Chromium builds
// (docs/plan/04-milestones-risks.md risk table).

import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer"
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer"

const H264 = "avc1.42003e" // baseline profile, level 6.2 — 1080² @30 fits
const VP9 = "vp09.00.10.08"

export interface PickedEncoder {
  encoder: VideoEncoder
  finish: () => Blob
  container: "mp4" | "webm"
}

export async function pickVideoConfig(
  width: number,
  height: number,
  fps: number
): Promise<PickedEncoder> {
  const base: VideoEncoderConfig = {
    codec: H264,
    width,
    height,
    framerate: fps,
    bitrate: 8_000_000,
  }

  const h264 = await VideoEncoder.isConfigSupported(base)
  if (h264.supported) {
    const muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: "avc", width, height, frameRate: fps },
      fastStart: "in-memory",
    })
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error("[export] encoder error", e),
    })
    encoder.configure(base)
    return {
      encoder,
      container: "mp4",
      finish: () => {
        muxer.finalize()
        return new Blob([muxer.target.buffer], { type: "video/mp4" })
      },
    }
  }

  const vp9Config: VideoEncoderConfig = { ...base, codec: VP9 }
  const vp9 = await VideoEncoder.isConfigSupported(vp9Config)
  if (!vp9.supported) {
    throw new Error(
      "no supported video encoder (H.264 and VP9 both unavailable)"
    )
  }
  const muxer = new WebmMuxer({
    target: new WebmTarget(),
    video: { codec: "V_VP9", width, height, frameRate: fps },
  })
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("[export] encoder error", e),
  })
  encoder.configure(vp9Config)
  return {
    encoder,
    container: "webm",
    finish: () => {
      muxer.finalize()
      return new Blob([muxer.target.buffer], { type: "video/webm" })
    },
  }
}
