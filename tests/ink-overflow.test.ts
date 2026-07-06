// inkOverflow — per-side distance an isolated unit's own shadow/filter paints
// beyond its border box. drawElementImage anchors an element's *visual* bounds
// (shadow included), so the capture scratch must grow by exactly these margins
// or the shadow is clipped AND the content composites offset — the bug where
// the DOM preview showed a drop shadow but the editor canvas dropped it and
// sheared the card's bottom corners.

import { describe, expect, it } from "vitest"
import { inkOverflow } from "@/engine/html-canvas/paint-units"

// Minimal stand-in for the getComputedStyle result the engine actually reads.
const cs = (boxShadow = "", filter = "") =>
  ({ boxShadow, filter }) as unknown as CSSStyleDeclaration

describe("inkOverflow", () => {
  it("is all-zero without shadow or filter", () => {
    expect(inkOverflow(cs())).toEqual({ l: 0, t: 0, r: 0, b: 0 })
    expect(inkOverflow(null)).toEqual({ l: 0, t: 0, r: 0, b: 0 })
    expect(inkOverflow(cs("none", "none"))).toEqual({ l: 0, t: 0, r: 0, b: 0 })
  })

  it("spreads an offset box-shadow asymmetrically per side (3σ blur reach)", () => {
    // The beauty-serum bottle: `0 40px 80px`. Blur reach = 80·1.5 = 120 every
    // side; the +40 y offset pushes the shadow down → bottom 160, top 80.
    expect(inkOverflow(cs("rgba(200, 80, 140, 0.3) 0px 40px 80px 0px"))).toEqual(
      { l: 120, t: 80, r: 120, b: 160 }
    )
  })

  it("adds spread on top of blur, and shifts by x offset", () => {
    // ext = blur 20·1.5 + spread 5 = 35; x +10 → left 25, right 45.
    expect(inkOverflow(cs("rgb(0, 0, 0) 10px 0px 20px 5px"))).toEqual({
      l: 25,
      t: 35,
      r: 45,
      b: 35,
    })
  })

  it("takes the per-side max across multiple shadows (rgba-safe split)", () => {
    // Second shadow dominates: blur 60·1.5 = 90 reach, +30 y → bottom 120.
    const shadow =
      "rgba(0, 0, 0, 0.2) 0px 2px 4px 0px, rgba(0, 0, 0, 0.4) 0px 30px 60px 0px"
    expect(inkOverflow(cs(shadow))).toEqual({ l: 90, t: 60, r: 90, b: 120 })
  })

  it("ignores inset shadows (they paint inside the box)", () => {
    expect(inkOverflow(cs("rgb(0, 0, 0) 0px 0px 40px 0px inset"))).toEqual({
      l: 0,
      t: 0,
      r: 0,
      b: 0,
    })
  })

  it("covers filter blur() symmetrically (3× radius) and drop-shadow()", () => {
    expect(inkOverflow(cs("", "blur(10px)"))).toEqual({
      l: 30,
      t: 30,
      r: 30,
      b: 30,
    })
    // drop-shadow: blur 16·1.5 = 24 reach ± offset, paren-aware past rgba().
    expect(
      inkOverflow(cs("", "drop-shadow(4px 8px 16px rgba(0, 0, 0, 0.5))"))
    ).toEqual({ l: 20, t: 16, r: 28, b: 32 })
  })

  it("clamps pathological values so the scratch can't balloon", () => {
    const o = inkOverflow(cs("rgb(0,0,0) 0px 0px 100000px 0px"))
    expect(o).toEqual({ l: 600, t: 600, r: 600, b: 600 })
  })
})
