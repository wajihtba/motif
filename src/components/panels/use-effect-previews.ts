// Live effect previews for the Effects tab picker: snapshot what the effect
// would actually apply to (the selected element's pixels, or the whole
// composited canvas) and run every candidate effect over that snapshot with
// the SAME GL pipeline the engine uses. The result is a grid of honest
// thumbnails — pick by eye, not by name.
//
// Previews are generated lazily in small batches (never blocking a frame for
// the whole catalogue) and cached per (effect, snapshot) key.

import { useEffect, useRef, useState } from "react"
import type { EditorController } from "@/controller"
import type { AnyEffectDef } from "@/effects/core/types"
import { packParams, paramDefaults } from "@/effects/core/registry"
import { GlPipeline } from "@/engine/gl/pipeline"

// Rendered at 2× the displayed card width so thumbnails stay crisp on any
// screen (cards are ~130 CSS px wide in the rail).
const THUMB_W = 260
const THUMB_MAX_H = 200

/** One shared preview pipeline (its own small WebGL context, separate from
 *  the engine's). null = WebGL2 unavailable → filter previews still work. */
let pipeline: GlPipeline | null | undefined
function getPipeline(): GlPipeline | null {
  if (pipeline === undefined) {
    try {
      pipeline = new GlPipeline()
    } catch {
      pipeline = null
    }
  }
  return pipeline
}

/** Snapshot the pixels an effect would see: the selected element's box cropped
 *  from the live engine canvas, or the whole canvas. */
function baseSnapshot(
  ctrl: EditorController,
  selectionId: string | null
): HTMLCanvasElement | null {
  const backend = ctrl.backendRef
  const src = backend?.stage.querySelector("canvas")
  if (!backend || !src || !src.width || !src.height) return null

  let sx = 0
  let sy = 0
  let sw = src.width
  let sh = src.height
  if (selectionId) {
    const box = backend.measure(selectionId)
    if (!box || box.w < 1 || box.h < 1) return null
    const dpr = src.width / ctrl.store.state.document.scene.baseWidth
    sx = box.x * dpr
    sy = box.y * dpr
    sw = Math.max(1, box.w * dpr)
    sh = Math.max(1, box.h * dpr)
  }

  const w = THUMB_W
  let h = Math.round((w * sh) / sw)
  if (h > THUMB_MAX_H) {
    // Cover-crop vertically (centered) instead of squashing tall sources.
    const cropped = (sw * THUMB_MAX_H) / w
    sy += (sh - cropped) / 2
    sh = cropped
    h = THUMB_MAX_H
  }
  if (h < 24) h = 24

  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  const ctx = out.getContext("2d")
  if (!ctx) return null
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h)
  return out
}

/** Render one effect over the snapshot. Returns a data URL, or null when the
 *  effect can't be previewed (no GL, custom GLSL with no body…). */
function renderPreview(
  def: AnyEffectDef,
  base: HTMLCanvasElement
): string | null {
  const w = base.width
  const h = base.height

  if (def.id === "custom") return base.toDataURL() // user code — no preset look

  if (def.kind === "filter") {
    const out = document.createElement("canvas")
    out.width = w
    out.height = h
    const ctx = out.getContext("2d")
    if (!ctx) return null
    ctx.filter = def.css(0.6, paramDefaults(def))
    ctx.drawImage(base, 0, 0)
    return out.toDataURL()
  }

  const gl = getPipeline()
  if (!gl) return null
  const t = def.animated ? 0.6 : 0
  const params = new Float32Array(packParams(def))
  let res: HTMLCanvasElement | null = null
  if (def.kind === "scene-shader") {
    res = gl.runSceneChain(
      base,
      [{ def, params, time: t, pointer: [0.5, 0.5] }],
      w,
      h
    )
  } else if (def.kind === "element-shader" || def.kind === "pixel") {
    res = gl.runChain(base, null, [{ def, params, time: t, masked: false }], w, h)
  }
  if (!res) return null
  // The pipeline reuses one canvas — copy before the next preview overwrites it.
  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  const ctx = out.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(res, 0, 0)
  return out.toDataURL()
}

export interface EffectPreviews {
  /** effect "<kind>.<id>" → data-url thumbnail (fills in progressively). */
  urls: Record<string, string>
  /** Aspect used by the current snapshot (w/h) so cards can reserve space. */
  aspect: number
  /** Re-snapshot + regenerate (e.g. after big design changes). */
  refresh: () => void
}

/** Generate previews for `defs` against the current selection (or canvas when
 *  `selectionId` is null). Regenerates when the target changes. */
export function useEffectPreviews(
  ctrl: EditorController,
  defs: AnyEffectDef[],
  selectionId: string | null
): EffectPreviews {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [aspect, setAspect] = useState(THUMB_W / 80)
  const [tick, setTick] = useState(0)
  const genRef = useRef(0)

  const defsKey = defs.map((d) => `${d.kind}.${d.id}`).join("|")

  useEffect(() => {
    const gen = ++genRef.current
    setUrls({})
    const base = baseSnapshot(ctrl, selectionId)
    if (!base) return
    setAspect(base.width / base.height)

    // Small batches keep the main thread responsive across ~50 GL passes.
    let i = 0
    const step = () => {
      if (gen !== genRef.current) return
      const batch: Record<string, string> = {}
      const end = Math.min(i + 6, defs.length)
      for (; i < end; i++) {
        const d = defs[i]
        const url = renderPreview(d, base)
        if (url) batch[`${d.kind}.${d.id}`] = url
      }
      setUrls((prev) => ({ ...prev, ...batch }))
      if (i < defs.length) setTimeout(step, 0)
    }
    step()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl, selectionId, defsKey, tick])

  return { urls, aspect, refresh: () => setTick((t) => t + 1) }
}
