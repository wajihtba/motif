// Tier-2 contrast sampling — settles the checks tier 1 deferred by reading
// REAL composited pixels from deterministic ExportSession frames.
//
// Two modes per check:
//   backdrop mode  (plain text, known css ink): one frame with every checked
//                  text hidden — the region under the box is the backdrop;
//                  judged against the css-resolved ink color.
//   ink-diff mode  (effect/filter-styled text, unparsable gradient fills):
//                  the SAME region from a frame with the text visible and one
//                  without it. Changed pixels are the rendered ink — glyphs
//                  after shaders/filters — each judged against the true
//                  backdrop pixel it covers. No css assumptions at all.
//
// Glyphs are hidden via color:transparent — NOT opacity/hidden: a text node
// can carry its own plate (a CTA button's background), and that plate IS the
// glyphs' backdrop, so it must stay painted in the "without" frame. Opacity
// would judge plate-vs-page instead of glyphs-vs-plate. Gradient-clip text is
// the exception (its background IS the fill, clipped to the glyphs) — that
// one hides via opacity:0. Layout is preserved byte-for-byte either way.
// Same t → same pixels (the ExportSession determinism contract), so verdicts
// are reproducible.

import type { Scene } from "../../scene/types"
import type { DeferredCheck } from "../../controller/contrast-lint"
import type { Rgba } from "../../lib/css-color"
import { aggregateInkSamples, aggregateSamples } from "../../lib/contrast"
import type { SampleVerdict } from "../../lib/contrast"
import { findNode } from "../../scene/model"
import { ExportSession } from "./index"

/** Backdrop mode downsampling: at most GRID×GRID samples per box. */
const GRID = 32
/** Ink-diff mode: sample near-full-res, capped at this many pixels per box —
 *  stride grows only on huge boxes (a coarse grid would miss glyph strokes). */
const MAX_INK_SAMPLES = 150_000
/** Bound the per-scene work: at most this many sampled frames. */
const MAX_FRAMES = 5

export interface SampleContrastOptions {
  /** Timeline seconds to sample; default [0] + animation keypoints. */
  times?: number[]
}

export async function sampleContrast(
  scene: Scene,
  checks: DeferredCheck[],
  opts: SampleContrastOptions = {}
): Promise<Map<string, SampleVerdict>> {
  const out = new Map<string, SampleVerdict>()
  if (!checks.length) return out

  const clone = structuredClone(scene)
  for (const check of checks) {
    const n = findNode(clone, check.id)
    if (!n) continue
    const clipText =
      check.reason === "clip-text" || check.textColorCss === "gradient"
    n.css = clipText
      ? { ...n.css, opacity: "0" }
      : { ...n.css, color: "transparent" }
    delete n.css.textShadow
  }

  const needInk = checks.some((c) => c.pixelInk)
  const times = opts.times ?? sampleTimes(scene)

  // Hidden-text session always; a with-text session only when some check
  // needs the ink diff. Mounted in parallel — each costs one settle.
  const [bare, full] = await Promise.all([
    ExportSession.create(clone),
    needInk ? ExportSession.create(structuredClone(scene)) : null,
  ])
  try {
    for (const t of times) {
      const bareFrame = readFrame(bare, t)
      if (!bareFrame) return out
      const fullFrame = full ? readFrame(full, t) : null
      for (const check of checks) {
        const verdict =
          check.pixelInk && fullFrame
            ? judgeInkRegion(fullFrame, bareFrame, check)
            : judgeBackdropRegion(bareFrame, check)
        if (!verdict) continue
        const prev = out.get(check.id)
        out.set(check.id, prev ? worseOf(prev, verdict) : verdict)
      }
    }
  } finally {
    bare.dispose()
    full?.dispose()
  }
  return out
}

function readFrame(session: ExportSession, t: number): ImageData | null {
  const canvas = session.frame(t)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  return ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null
}

/** t=0 plus the start/end of enabled animation windows — positions animate
 *  (colors never do), so a moving text/backdrop is judged at its extremes.
 *  Capped at MAX_FRAMES; deterministic order. */
export function sampleTimes(scene: Scene): number[] {
  const duration = Math.max(0, scene.timeline.duration)
  const dt = 1 / (scene.timeline.fps || 30)
  const clamp = (t: number) =>
    Math.min(Math.max(0, t), Math.max(0, duration - dt))
  const times = new Set<number>([0])
  for (const track of scene.animations) {
    if (!track.enabled) continue
    const start = track.start ?? 0
    times.add(clamp(start))
    if (track.duration) times.add(clamp(start + track.duration))
  }
  return [...times].sort((a, b) => a - b).slice(0, MAX_FRAMES)
}

interface Region {
  pixels: Rgba[]
  gridW: number
  gridH: number
}

/** Slice the check's box from a frame at the given stride. */
function sliceRegion(
  frame: ImageData,
  check: DeferredCheck,
  maxSamples: number
): Region | null {
  const x0 = Math.max(0, Math.floor(check.box.x))
  const y0 = Math.max(0, Math.floor(check.box.y))
  const x1 = Math.min(frame.width, Math.ceil(check.box.x + check.box.w))
  const y1 = Math.min(frame.height, Math.ceil(check.box.y + check.box.h))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 1 || h < 1) return null

  const stride = Math.max(1, Math.ceil(Math.sqrt((w * h) / maxSamples)))
  const pixels: Rgba[] = []
  let gridW = 0
  let gridH = 0
  for (let y = y0; y < y1; y += stride) {
    gridH++
    let row = 0
    for (let x = x0; x < x1; x += stride) {
      row++
      const i = (y * frame.width + x) * 4
      pixels.push({
        r: frame.data[i],
        g: frame.data[i + 1],
        b: frame.data[i + 2],
        a: 1, // the composited frame is opaque
      })
    }
    gridW = row
  }
  return pixels.length ? { pixels, gridW, gridH } : null
}

/** Backdrop mode: judge the hidden-text region against every effective css
 *  text color (several for gradient type), taking the worst. */
function judgeBackdropRegion(
  bare: ImageData,
  check: DeferredCheck
): SampleVerdict | null {
  const region = sliceRegion(bare, check, GRID * GRID)
  if (!region) return null
  let worst: SampleVerdict | null = null
  for (const color of check.textColors) {
    const v = aggregateSamples(
      region.pixels,
      region.gridW,
      region.gridH,
      color,
      check.required
    )
    worst = worst ? worseOf(worst, v) : v
  }
  return worst
}

/** Ink-diff mode: rendered glyph pixels (with-text minus without-text) vs the
 *  true backdrop pixels they cover. Near-full-res — a coarse grid would step
 *  over 2-3px glyph strokes entirely. */
function judgeInkRegion(
  full: ImageData,
  bare: ImageData,
  check: DeferredCheck
): SampleVerdict | null {
  const withText = sliceRegion(full, check, MAX_INK_SAMPLES)
  const without = sliceRegion(bare, check, MAX_INK_SAMPLES)
  if (!withText || !without) return null
  return aggregateInkSamples(
    withText.pixels,
    without.pixels,
    withText.gridW,
    withText.gridH,
    check.required
  )
}

function worseOf(a: SampleVerdict, b: SampleVerdict): SampleVerdict {
  const worse = a.worstRatio <= b.worstRatio ? a : b
  return {
    pass: a.pass && b.pass,
    worstRatio: worse.worstRatio,
    failFrac: Math.max(a.failFrac, b.failFrac),
    medianBackdrop: worse.medianBackdrop,
    ink: worse.ink ?? a.ink ?? b.ink,
  }
}
