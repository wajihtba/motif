// Resize geometry golden tests — pure box in, pure box out, mirroring snap.ts.
// The interaction layer only feeds a start box + pointer delta and applies the
// result, so covering every handle + modifier here keeps the DOM layer thin.

import { describe, expect, it } from "vitest"
import { collectSnapLines } from "@/engine/snap"
import { resizeBox, snapResize } from "@/engine/resize"

const start = { x: 100, y: 100, w: 200, h: 100 }
const opts = { min: 12 }

describe("resizeBox", () => {
  it("se grows toward the bottom-right, top-left fixed", () => {
    expect(resizeBox(start, "se", 40, 30, opts)).toEqual({
      x: 100,
      y: 100,
      w: 240,
      h: 130,
    })
  })

  it("nw moves the top-left, bottom-right fixed", () => {
    const r = resizeBox(start, "nw", 20, 10, opts)
    // left edge +20, top edge +10; right (300) and bottom (200) stay put
    expect(r).toEqual({ x: 120, y: 110, w: 180, h: 90 })
    expect(r.x + r.w).toBe(300)
    expect(r.y + r.h).toBe(200)
  })

  it("w resizes only the horizontal axis", () => {
    expect(resizeBox(start, "w", -50, 999, opts)).toEqual({
      x: 50,
      y: 100,
      w: 250,
      h: 100,
    })
  })

  it("n resizes only the vertical axis", () => {
    expect(resizeBox(start, "n", 999, -20, opts)).toEqual({
      x: 100,
      y: 80,
      w: 200,
      h: 120,
    })
  })

  it("clamps to the min size without inverting the box", () => {
    const r = resizeBox(start, "e", -500, 0, opts)
    expect(r.w).toBe(12)
    expect(r.x).toBe(100) // left edge stays fixed for an east handle
  })

  it("center (Alt) grows symmetrically about the middle", () => {
    const r = resizeBox(start, "e", 30, 0, { ...opts, center: true })
    expect(r.w).toBe(260) // +30 on each side
    expect(r.x).toBe(70) // recentred: 200 → 100 - 30
    expect(r.x + r.w).toBe(330)
  })

  it("aspect (Shift) on a side handle drives the other axis", () => {
    // start ratio 2:1 — width 200→300 forces height 150
    const r = resizeBox(start, "e", 100, 0, { ...opts, aspect: true })
    expect(r.w).toBe(300)
    expect(r.h).toBe(150)
    expect(r.y).toBe(75) // recentred vertically around the fixed axis
  })

  it("aspect on a corner scales uniformly by the dominant axis", () => {
    // dragging se by (200, 10): width wants ×2, height wants ×1.1 → width wins
    const r = resizeBox(start, "se", 200, 10, { ...opts, aspect: true })
    expect(r.w).toBe(400)
    expect(r.h).toBe(200) // 2:1 preserved
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
  })
})

describe("snapResize", () => {
  const frame = { x: 0, y: 0, w: 1000, h: 1000 }

  it("snaps the moving edge of a side handle to a sibling", () => {
    const cand = collectSnapLines([{ x: 404, y: 0, w: 50, h: 50 }])
    // east handle pushed the right edge to 400; sibling left edge at 404
    const box = { x: 100, y: 100, w: 300, h: 100 }
    const r = snapResize(box, start, "e", cand, 6, opts)
    expect(r.box.w).toBe(304)
    expect(r.box.x).toBe(100)
    expect(r.guides).toHaveLength(1)
    expect(r.guides[0]).toMatchObject({ axis: "x", pos: 404 })
  })

  it("snaps a west handle by moving its left edge and keeping the right fixed", () => {
    const cand = collectSnapLines([frame]) // frame left edge at 0
    const box = { x: 3, y: 100, w: 297, h: 100 } // left edge dragged near 0
    const r = snapResize(box, start, "w", cand, 6, opts)
    expect(r.box.x).toBe(0)
    expect(r.box.x + r.box.w).toBe(300) // original right edge preserved
  })

  it("does not snap while aspect/center-locked (coupled edges are ambiguous)", () => {
    const cand = collectSnapLines([frame])
    const box = { x: 3, y: 100, w: 297, h: 100 }
    expect(
      snapResize(box, start, "w", cand, 6, { ...opts, aspect: true }).box
    ).toEqual(box)
    expect(
      snapResize(box, start, "w", cand, 6, { ...opts, center: true }).guides
    ).toHaveLength(0)
  })
})
