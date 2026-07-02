// Export — image + video (docs/plan/02-performance.md §5). Both run on a
// DEDICATED export session: a second backend at dpr=1 whose backing store is
// the exact format pixel size, mounted on-screen-but-behind (paint records
// require an on-screen canvas — the conformance suite's discovery). The live
// editor canvas never takes part; the visible viewport stays interactive.
//
// Video is deterministic frame-stepping, never realtime capture: seek(t) →
// renderFrame → VideoFrame → encode. Same t → same pixels, so frame N is
// identical across exports and export duration is bounded by encode speed,
// not wall-clock playback (MediaRecorder was rejected for exactly that).

import type { Scene } from "../../scene/types"
import { HtmlCanvasBackend } from "../html-canvas"
import { pickVideoConfig } from "./mux"

export class ExportSession {
  private container: HTMLElement
  readonly backend: HtmlCanvasBackend

  private constructor(container: HTMLElement, backend: HtmlCanvasBackend) {
    this.container = container
    this.backend = backend
  }

  /** Mount a hidden dpr=1 session for `scene` and wait for content settle. */
  static async create(scene: Scene): Promise<ExportSession> {
    const container = document.createElement("div")
    Object.assign(container.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "-9999",
      pointerEvents: "none",
      opacity: "1", // must stay painted — paint records need visibility
    })
    document.body.appendChild(container)
    const backend = new HtmlCanvasBackend({ forceDpr: 1 })
    backend.mount(container)
    backend.setScene(scene)
    await backend.whenIdle()
    // One extra settle so unit captures reflect fresh paint records.
    await raf()
    await raf()
    const session = new ExportSession(container, backend)
    return session
  }

  get canvas(): HTMLCanvasElement {
    return this.backend.canvas
  }

  /** Render the deterministic frame at time t (seconds). */
  frame(t: number): HTMLCanvasElement {
    this.backend.renderFrame(t)
    return this.backend.canvas
  }

  dispose(): void {
    this.backend.dispose()
    this.container.remove()
  }
}

// --- image -----------------------------------------------------------------------

export async function exportImage(
  scene: Scene,
  type: "png" | "jpeg",
  t = 0
): Promise<Blob> {
  const session = await ExportSession.create(scene)
  try {
    const canvas = session.frame(t)
    return await toBlob(canvas, type)
  } finally {
    session.dispose()
  }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: "png" | "jpeg"
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error(
                "export failed — the canvas may be tainted by a cross-origin image"
              )
            ),
      type === "jpeg" ? "image/jpeg" : "image/png",
      0.95
    )
  })
}

// --- video -----------------------------------------------------------------------

export interface VideoExportOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface VideoExportResult {
  blob: Blob
  /** 'mp4' (H.264) or 'webm' (VP9 fallback — some Linux builds lack H.264). */
  container: "mp4" | "webm"
  frames: number
  /** Render-path determinism probe: hash of the mid-export frame's pixels. */
  probeHash: string
}

export async function exportVideo(
  scene: Scene,
  opts: VideoExportOptions = {}
): Promise<VideoExportResult> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs is unavailable in this browser")
  }
  const width = even(scene.baseWidth)
  const height = even(scene.baseHeight)
  const fps = scene.timeline.fps || 30
  const total = Math.max(1, Math.round(scene.timeline.duration * fps))

  const session = await ExportSession.create(scene)
  try {
    const { encoder, finish, container } = await pickVideoConfig(
      width,
      height,
      fps
    )
    const probeIndex = Math.floor(total / 2)
    let probeHash = ""

    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) {
        encoder.close()
        throw new DOMException("export cancelled", "AbortError")
      }
      const t = i / fps
      const canvas = session.frame(t)
      if (i === probeIndex) probeHash = await hashCanvas(canvas)
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      })
      encoder.encode(frame, { keyFrame: i % 60 === 0 })
      frame.close()

      // Backpressure: let the encoder drain (docs/plan §5). setTimeout, not
      // rAF — rAF throttles in occluded/headless pages and would stall this.
      while (encoder.encodeQueueSize > 4) await tick(4)
      if (i % 5 === 0) opts.onProgress?.(i, total)
      await tick(0) // yield every frame: keep the UI and devtools alive
    }
    await encoder.flush()
    const blob = finish()
    opts.onProgress?.(total, total)
    return { blob, container, frames: total, probeHash }
  } finally {
    session.dispose()
  }
}

/** Stable content hash of a canvas (determinism probe — export path only,
 *  never the frame path). */
async function hashCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await toBlob(canvas, "png")
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function even(n: number): number {
  return n % 2 === 0 ? n : n + 1
}

function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function tick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
