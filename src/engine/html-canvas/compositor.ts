// Frame composition — device px, identity transform throughout (dpr.ts rules).
//
// Per frame (docs/plan/01-architecture.md §5):
//
//   capture:   for each isolated unit whose scratch is stale, draw the unit
//              alone into the (cleared) owner canvas via drawElementImage and
//              copy the region out to its pooled scratch. A unit drawn alone
//              IS its own content silhouette — no cross-frame isolation
//              handshake. All of this happens inside one paint callback, so
//              intermediate states are never presented.
//   composite: clear → background → units in paint order. Static units take
//              the direct drawElementImage fast path; isolated units drawImage
//              their cached scratch with the sampler's transform/opacity about
//              the unit center — a spinning badge re-uploads nothing.
//
// drawElementImage can only paint elements owned by their own canvas, which is
// why capture goes through the visible canvas rather than straight to scratch
// (conformance case `foreign-canvas` tracks whether the platform ever lifts
// this).
//
// EFFECTS (M3, GPU-resident): between a unit's scratch and its composite,
// its GL chain runs — u_back sampled from the frame accumulated SO FAR (the
// in-frame backdrop that kills v1's two-frame handshake). After all units:
// canvas-wide chains, then the scene-shader chain, then canvas filters.
// Zero getImageData anywhere in this path.

import type { Box, UnitSample, UnitSampler } from "../backend"
import type { EffectPlan, ResolvedFilterLayer } from "../effect-plan"
import type { ChainLayer } from "../gl/pipeline"
import type { PaintUnit } from "./paint-units"
import { packParams } from "../../effects/core/registry"
import { IDENTITY_SAMPLE } from "../backend"
import { GlPipeline } from "../gl/pipeline"
import { toDevice } from "./dpr"

type DrawElementFn = (
  el: Element,
  x: number,
  y: number,
  w?: number,
  h?: number
) => unknown

export class Compositor {
  private ctx: CanvasRenderingContext2D
  private draw: DrawElementFn | null
  private bgEl: HTMLElement | null = null
  private units: PaintUnit[] = []
  private dpr = 1
  sampler: UnitSampler | null = null
  /** Resolved effect stack (effect-plan.ts); set by the backend on changes. */
  plan: EffectPlan | null = null
  /** Pointer in normalized canvas coords (pointer-following scene shaders). */
  pointer: [number, number] = [0.5, 0.5]

  private gl: GlPipeline | null = null
  private glFailed = false
  // Pooled 2D scratches for backdrop regions and full-frame passes.
  private backCanvas = document.createElement("canvas")
  private frameCanvas = document.createElement("canvas")

  constructor(readonly canvas: HTMLCanvasElement) {
    // getContext can return null (jsdom in tests) — the DOM-patching half of
    // the engine still works; only painting no-ops (draw stays null).
    const ctx = canvas.getContext("2d")
    this.ctx = ctx!
    this.draw = !ctx
      ? null
      : ctx.drawElementImage
        ? ctx.drawElementImage.bind(ctx)
        : ctx.drawElement
          ? ctx.drawElement.bind(ctx)
          : null
  }

  /** Lazy shared GL pipeline (once; sticky failure). */
  pipeline(): GlPipeline | null {
    if (this.gl || this.glFailed) return this.gl
    try {
      this.gl = new GlPipeline()
    } catch {
      this.glFailed = true
    }
    return this.gl
  }

  get supported(): boolean {
    return !!this.draw
  }

  setContent(bgEl: HTMLElement, units: PaintUnit[], dpr: number): void {
    this.bgEl = bgEl
    this.units = units
    this.dpr = dpr
  }

  /** Invalidate captured pixels (after DOM patches). Transform changes never
   *  call this — recomposite alone picks up the new sample. */
  markUnitsStale(ids?: Iterable<string>): void {
    const set = ids ? new Set(ids) : null
    for (const u of this.units) {
      if (!set || set.has(u.id)) u.captured = false
    }
  }

  /** Draw the full frame at time t. Deterministic: same t, same content →
   *  same pixels (given settled paint records). */
  compose(tSec: number): void {
    const { ctx, draw } = this
    if (!draw) return
    const W = this.canvas.width
    const H = this.canvas.height

    // --- capture pass -------------------------------------------------------
    for (const unit of this.units) {
      if (!unit.isolated || unit.captured) continue
      this.capture(unit)
    }

    // --- composite pass -----------------------------------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (this.bgEl) draw(this.bgEl, 0, 0)
    for (const unit of this.units) {
      if (!unit.isolated) {
        // Static fast path — the background unit paints direct.
        draw(unit.el, unit.box.x, unit.box.y)
        continue
      }
      if (!unit.scratch || !unit.captured) continue
      const s = this.sampler?.(tSec, unit.id) ?? IDENTITY_SAMPLE
      if (s.opacity <= 0) continue
      this.compositeUnit(unit, s, tSec)
    }

    // --- effect post passes ---------------------------------------------------
    this.applyCanvasChain(tSec)
    this.applySceneChain(tSec)
    this.applyCanvasFilters(tSec)
  }

  /** element-shader/pixel layers addressed at the whole canvas. */
  private applyCanvasChain(tSec: number): void {
    const layers = this.plan?.canvasChain
    if (!layers?.length) return
    const gl = this.pipeline()
    if (!gl) return
    const { ctx } = this
    const W = this.canvas.width
    const H = this.canvas.height
    // Snapshot the frame (canvas can't be both texture source and drawTarget).
    sizeCanvas(this.frameCanvas, W, H)
    const fctx = this.frameCanvas.getContext("2d")!
    fctx.clearRect(0, 0, W, H)
    fctx.drawImage(this.canvas, 0, 0)
    const out = gl.runChain(
      this.frameCanvas,
      null,
      layers.map((l) => this.chainLayer(l, tSec)),
      W,
      H
    )
    if (!out) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(out, 0, 0)
  }

  /** Full-frame scene shaders, ping-ponged in stack order. */
  private applySceneChain(tSec: number): void {
    const layers = this.plan?.scene
    if (!layers?.length) return
    const gl = this.pipeline()
    if (!gl) return
    const { ctx } = this
    const W = this.canvas.width
    const H = this.canvas.height
    sizeCanvas(this.frameCanvas, W, H)
    const fctx = this.frameCanvas.getContext("2d")!
    fctx.clearRect(0, 0, W, H)
    fctx.drawImage(this.canvas, 0, 0)
    const out = gl.runSceneChain(
      this.frameCanvas,
      layers.map((l) => ({
        def: l.def,
        time: l.layer.animate ? tSec : 0,
        pointer: this.pointer,
      })),
      W,
      H
    )
    if (!out) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(out, 0, 0)
  }

  /** ctx.filter grade over the whole frame (drawImage only — GPU path). */
  private applyCanvasFilters(tSec: number): void {
    const layers = this.plan?.canvasFilters
    if (!layers?.length) return
    const { ctx } = this
    const W = this.canvas.width
    const H = this.canvas.height
    sizeCanvas(this.frameCanvas, W, H)
    const fctx = this.frameCanvas.getContext("2d")!
    fctx.clearRect(0, 0, W, H)
    fctx.drawImage(this.canvas, 0, 0)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = this.filterCss(layers, tSec)
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(this.frameCanvas, 0, 0)
    ctx.restore()
  }

  private filterCss(layers: ResolvedFilterLayer[], tSec: number): string {
    return (
      layers
        .map((l) => l.def.css(l.layer.animate ? tSec : 0, l.layer.params))
        .filter(Boolean)
        .join(" ") || "none"
    )
  }

  private chainLayer(
    l: { def: ChainLayer["def"]; layer: import("../../scene/types").EffectLayer },
    tSec: number
  ): ChainLayer {
    return {
      def: l.def,
      params: new Float32Array(packParams(l.def, l.layer.params)),
      time: l.layer.animate ? tSec : 0,
      masked: l.layer.scope !== "box",
      frag:
        l.def.id === "custom" && typeof l.layer.frag === "string"
          ? l.layer.frag
          : undefined,
    }
  }

  /** Paint one unit alone into the owner canvas and copy it out to scratch. */
  private capture(unit: PaintUnit): void {
    const { ctx, draw, dpr } = this
    if (!draw) return
    const dw = Math.max(1, toDevice(unit.box.w, dpr))
    const dh = Math.max(1, toDevice(unit.box.h, dpr))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    draw(unit.el, 0, 0)

    unit.scratch ??= document.createElement("canvas")
    sizeCanvas(unit.scratch, dw, dh)
    const sctx = unit.scratch.getContext("2d")!
    sctx.clearRect(0, 0, dw, dh)
    sctx.drawImage(this.canvas, 0, 0, dw, dh, 0, 0, dw, dh)
    unit.captured = true
  }

  /** drawImage the unit's pixels (through its GL chain when it has one) with
   *  transform/opacity about its center. */
  private compositeUnit(unit: PaintUnit, s: UnitSample, tSec: number): void {
    const { ctx, dpr } = this
    const scratch = unit.scratch!
    const dw = scratch.width
    const dh = scratch.height

    let source: CanvasImageSource = scratch
    const fx = this.plan?.perUnit.get(unit.id)
    if (fx?.chain.length) {
      const gl = this.pipeline()
      if (gl) {
        // In-frame backdrop: the frame accumulated SO FAR under the unit box.
        const bx = toDevice(unit.box.x, dpr)
        const by = toDevice(unit.box.y, dpr)
        sizeCanvas(this.backCanvas, dw, dh)
        const bctx = this.backCanvas.getContext("2d")!
        bctx.clearRect(0, 0, dw, dh)
        bctx.drawImage(this.canvas, bx, by, dw, dh, 0, 0, dw, dh)
        const out = gl.runChain(
          scratch,
          this.backCanvas,
          fx.chain.map((l) => this.chainLayer(l, tSec)),
          dw,
          dh
        )
        if (out) source = out
      }
    }

    const cx = toDevice(unit.box.x + unit.box.w / 2 + s.x, dpr)
    const cy = toDevice(unit.box.y + unit.box.h / 2 + s.y, dpr)
    ctx.save()
    ctx.globalAlpha = Math.min(1, Math.max(0, s.opacity))
    if (fx?.filters.length) ctx.filter = this.filterCss(fx.filters, tSec)
    ctx.translate(cx, cy)
    if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180)
    if (s.scale !== 1) ctx.scale(s.scale, s.scale)
    ctx.drawImage(source, -dw / 2, -dh / 2)
    ctx.restore()
  }

  /** Update a unit's box (re-measure) without recapturing its pixels. */
  repositionUnit(id: string, box: Box): void {
    const unit = this.units.find((u) => u.id === id)
    if (unit) unit.box = box
  }
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
}

