// Snap math golden tests — pure boxes in, deltas + guides out. The interaction
// layer only feeds it measured boxes and applies the returned correction.

import { describe, expect, it } from "vitest"
import { collectSnapLines, computeSnap } from "@/engine/snap"

const frame = { x: 0, y: 0, w: 1000, h: 1000 }

describe("computeSnap", () => {
  it("snaps a left edge to a sibling's left edge within the radius", () => {
    const cand = collectSnapLines([{ x: 200, y: 100, w: 100, h: 50 }])
    const r = computeSnap({ x: 204, y: 400, w: 80, h: 40 }, cand, 6)
    expect(r.dx).toBe(-4)
    expect(r.dy).toBe(0)
    expect(r.guides).toHaveLength(1)
    expect(r.guides[0]).toMatchObject({ axis: "x", pos: 200 })
    // the guide segment spans both boxes
    expect(r.guides[0].from).toBe(100)
    expect(r.guides[0].to).toBe(440)
  })

  it("snaps centers to the canvas center", () => {
    const cand = collectSnapLines([frame])
    // moving box center at (497, 803) — x within radius of 500, y not
    const r = computeSnap({ x: 447, y: 753, w: 100, h: 100 }, cand, 6)
    expect(r.dx).toBe(3)
    expect(r.dy).toBe(0)
  })

  it("prefers the nearest line and snaps both axes independently", () => {
    const cand = collectSnapLines([
      { x: 100, y: 100, w: 100, h: 100 }, // right edge at 200
      { x: 203, y: 500, w: 50, h: 50 }, // left edge at 203
    ])
    const r = computeSnap({ x: 202, y: 197, w: 80, h: 40 }, cand, 6)
    expect(r.dx).toBe(1) // 203 beats 200 (|1| < |2|)
    expect(r.dy).toBe(3) // top edge 197 → sibling bottom 200
    expect(r.guides).toHaveLength(2)
  })

  it("returns identity outside the radius", () => {
    const cand = collectSnapLines([frame])
    const r = computeSnap({ x: 321, y: 321, w: 47, h: 47 }, cand, 6)
    expect(r).toMatchObject({ dx: 0, dy: 0 })
    expect(r.guides).toHaveLength(0)
  })
})
