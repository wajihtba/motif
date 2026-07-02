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
// this). The GL effect chain (M3) hooks between capture and composite.

import type { Box, UnitSample, UnitSampler } from "../backend"
import type { PaintUnit } from "./paint-units"
import { IDENTITY_SAMPLE } from "../backend"
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
      this.compositeUnit(unit, s)
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

  /** drawImage the unit's scratch with transform/opacity about its center. */
  private compositeUnit(unit: PaintUnit, s: UnitSample): void {
    const { ctx, dpr } = this
    const scratch = unit.scratch!
    const cx = toDevice(unit.box.x + unit.box.w / 2 + s.x, dpr)
    const cy = toDevice(unit.box.y + unit.box.h / 2 + s.y, dpr)
    ctx.save()
    ctx.globalAlpha = Math.min(1, Math.max(0, s.opacity))
    ctx.translate(cx, cy)
    if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180)
    if (s.scale !== 1) ctx.scale(s.scale, s.scale)
    ctx.drawImage(scratch, -scratch.width / 2, -scratch.height / 2)
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
