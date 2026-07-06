// Golden tests for the pure contrast math (src/lib/contrast.ts) — WCAG
// published values, OKLCH round-trips, and the block-median sample verdicts.

import { describe, expect, it } from "vitest"
import type { Rgba } from "@/lib/css-color"
import {
  adjustLightnessForContrast,
  aggregateInkSamples,
  aggregateSamples,
  compositeOver,
  contrastRatio,
  oklchToRgba,
  relativeLuminance,
  requiredRatio,
  rgbaToOklch,
} from "@/lib/contrast"

const rgb = (r: number, g: number, b: number, a = 1): Rgba => ({ r, g, b, a })
const WHITE = rgb(255, 255, 255)
const BLACK = rgb(0, 0, 0)

describe("WCAG contrast", () => {
  it("white/black is 21:1, self is 1:1", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5) // symmetric
  })

  it("#767676 on white is the canonical ~4.54:1 AA boundary", () => {
    const gray = rgb(0x76, 0x76, 0x76)
    expect(contrastRatio(gray, WHITE)).toBeGreaterThan(4.5)
    expect(contrastRatio(gray, WHITE)).toBeLessThan(4.6)
  })

  it("relative luminance endpoints", () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6)
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6)
  })

  it("requiredRatio: large-text boundaries", () => {
    expect(requiredRatio(24, 400)).toBe(3)
    expect(requiredRatio(23.9, 400)).toBe(4.5)
    expect(requiredRatio(18.66, 700)).toBe(3)
    expect(requiredRatio(18.66, 400)).toBe(4.5)
    expect(requiredRatio(16, 700)).toBe(4.5)
  })
})

describe("compositeOver", () => {
  it("opaque fg wins; transparent fg yields bg", () => {
    expect(compositeOver(rgb(10, 20, 30), WHITE)).toEqual(rgb(10, 20, 30))
    const out = compositeOver(rgb(10, 20, 30, 0), WHITE)
    expect(out.r).toBeCloseTo(255)
    expect(out.a).toBeCloseTo(1)
  })

  it("50% black over white is mid gray", () => {
    const out = compositeOver(rgb(0, 0, 0, 0.5), WHITE)
    expect(out.r).toBeCloseTo(127.5, 1)
    expect(out.a).toBeCloseTo(1)
  })

  it("stacks semi-transparent layers", () => {
    // 50% black over 50% black = 75% black
    const out = compositeOver(rgb(0, 0, 0, 0.5), rgb(0, 0, 0, 0.5))
    expect(out.a).toBeCloseTo(0.75, 5)
  })
})

describe("OKLCH", () => {
  const samples = [
    WHITE,
    BLACK,
    rgb(255, 0, 0),
    rgb(0, 128, 255),
    rgb(34, 177, 76),
    rgb(0x76, 0x76, 0x76),
    rgb(250, 235, 10),
  ]

  it("round-trips sRGB within 1/255 per channel", () => {
    for (const c of samples) {
      const back = oklchToRgba(rgbaToOklch(c))
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1)
    }
  })

  it("gamut-clamps impossible chroma by reducing chroma, keeping hue", () => {
    const out = oklchToRgba({ l: 0.6, c: 3, h: 30 })
    for (const ch of [out.r, out.g, out.b]) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(255)
    }
    expect(Math.abs(rgbaToOklch(out).h - 30)).toBeLessThan(2)
  })
})

describe("adjustLightnessForContrast", () => {
  it("returns the color unchanged when it already passes", () => {
    const out = adjustLightnessForContrast(BLACK, WHITE, 4.5)!
    expect(contrastRatio(out, WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(rgbaToOklch(out).l).toBeCloseTo(0, 2)
  })

  it("darkens white-on-white to reach 4.5:1, preserving hue", () => {
    const text = rgb(255, 240, 240) // warm near-white
    const out = adjustLightnessForContrast(text, WHITE, 4.5)!
    expect(
      contrastRatio(compositeOver(out, WHITE), WHITE)
    ).toBeGreaterThanOrEqual(4.5)
    const inHue = rgbaToOklch(text).h
    const outHue = rgbaToOklch(out).h
    // hue preserved unless chroma collapsed to zero
    if (rgbaToOklch(out).c > 0.005) {
      expect(Math.abs(outHue - inHue)).toBeLessThan(6)
    }
  })

  it("lightens dark-on-dark", () => {
    const out = adjustLightnessForContrast(
      rgb(40, 40, 60),
      rgb(20, 20, 30),
      4.5
    )!
    expect(
      contrastRatio(compositeOver(out, rgb(20, 20, 30)), rgb(20, 20, 30))
    ).toBeGreaterThanOrEqual(4.5)
    expect(relativeLuminance(out)).toBeGreaterThan(
      relativeLuminance(rgb(40, 40, 60))
    )
  })

  it("moves minimally — the result sits near the threshold, not at the pole", () => {
    const out = adjustLightnessForContrast(rgb(200, 200, 200), WHITE, 4.5)!
    const ratio = contrastRatio(compositeOver(out, WHITE), WHITE)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeLessThan(5.2)
  })

  it("returns null when no lightness can reach the target (mid-gray backdrop, 21:1)", () => {
    const mid = rgb(128, 128, 128)
    expect(adjustLightnessForContrast(rgb(100, 100, 100), mid, 21)).toBeNull()
  })

  it("preserves alpha and accounts for it in compositing", () => {
    const out = adjustLightnessForContrast(rgb(255, 255, 255, 0.9), WHITE, 4.5)!
    expect(out.a).toBeCloseTo(0.9, 5)
    expect(
      contrastRatio(compositeOver(out, WHITE), WHITE)
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe("aggregateSamples", () => {
  const grid = (w: number, h: number, fill: (x: number, y: number) => Rgba) => {
    const px: Rgba[] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(fill(x, y))
    return px
  }

  it("uniform dark backdrop passes for white text", () => {
    const v = aggregateSamples(
      grid(16, 8, () => rgb(10, 10, 10)),
      16,
      8,
      WHITE,
      4.5
    )
    expect(v.pass).toBe(true)
    expect(v.worstRatio).toBeGreaterThan(15)
    expect(v.medianBackdrop.r).toBe(10)
  })

  it("one washed-out corner fails even though the average would pass", () => {
    // right quarter is near-white → its block median fails for white text
    const v = aggregateSamples(
      grid(16, 8, (x) => (x >= 12 ? rgb(240, 240, 240) : rgb(10, 10, 10))),
      16,
      8,
      WHITE,
      4.5
    )
    expect(v.pass).toBe(false)
    expect(v.worstRatio).toBeLessThan(4.5)
    expect(v.failFrac).toBeCloseTo(0.25, 2)
  })

  it("sparse grain speckles do not flip the block medians", () => {
    // every 7th pixel is a white grain fleck on a dark photo
    const v = aggregateSamples(
      grid(16, 8, (x, y) => ((x + y * 16) % 7 === 0 ? WHITE : rgb(15, 15, 15))),
      16,
      8,
      WHITE,
      4.5
    )
    expect(v.pass).toBe(true)
  })

  it("semi-transparent text composites over each sample", () => {
    // 40% white text over near-white: effective color ~white → unreadable
    const v = aggregateSamples(
      grid(8, 4, () => rgb(235, 235, 235)),
      8,
      4,
      rgb(255, 255, 255, 0.4),
      4.5
    )
    expect(v.pass).toBe(false)
  })
})

describe("aggregateInkSamples (ink-diff mode)", () => {
  // Build a with/without pair: `paint` returns the WITH pixel at (x,y) or
  // null to keep the backdrop pixel (no ink there).
  const pair = (
    w: number,
    h: number,
    backdrop: (x: number, y: number) => Rgba,
    paint: (x: number, y: number) => Rgba | null
  ) => {
    const without: Rgba[] = []
    const withText: Rgba[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bg = backdrop(x, y)
        without.push(bg)
        withText.push(paint(x, y) ?? bg)
      }
    }
    return { withText, without }
  }

  const purple = rgb(165, 58, 158)
  const teal = rgb(111, 139, 128) // ~1.1:1 vs purple — the reported miss

  it("flags teal glyphs on purple (similar luminance, obvious to the eye)", () => {
    const { withText, without } = pair(
      40,
      12,
      () => purple,
      (x, y) => (x % 4 < 2 && y > 2 && y < 10 ? teal : null) // stroke pattern
    )
    const v = aggregateInkSamples(withText, without, 40, 12, 3.0)
    expect(v.pass).toBe(false)
    expect(v.worstRatio).toBeLessThan(2)
    expect(v.ink).not.toBeNull()
  })

  it("passes white glyphs on purple", () => {
    const { withText, without } = pair(
      40,
      12,
      () => purple,
      (x, y) => (x % 4 < 2 && y > 2 && y < 10 ? WHITE : null)
    )
    const v = aggregateInkSamples(withText, without, 40, 12, 4.5)
    expect(v.pass).toBe(true)
  })

  it("anti-aliased edges don't drag a readable glyph into a false flag", () => {
    // Strokes: white core flanked by 50% blends toward the backdrop.
    const { withText, without } = pair(
      48,
      12,
      () => purple,
      (x) => {
        const m = x % 6
        if (m === 2 || m === 3) return WHITE // core
        if (m === 1 || m === 4) return rgb(210, 157, 207) // AA blend
        return null
      }
    )
    const v = aggregateInkSamples(withText, without, 48, 12, 4.5)
    expect(v.pass).toBe(true) // p90 rides the cores, not the blends
  })

  it("a contrasting halo carrying the glyph shape passes (reads fine)", () => {
    // Teal core wrapped in near-black halo pixels — readable in practice.
    const { withText, without } = pair(
      48,
      12,
      () => purple,
      (x) => {
        const m = x % 6
        if (m === 2 || m === 3) return teal
        if (m === 1 || m === 4) return rgb(10, 10, 14) // halo
        return null
      }
    )
    const v = aggregateInkSamples(withText, without, 48, 12, 3.0)
    expect(v.pass).toBe(true)
  })

  it("no visible ink (text faded out at this frame) passes trivially", () => {
    const { withText, without } = pair(
      20,
      8,
      () => purple,
      () => null
    )
    const v = aggregateInkSamples(withText, without, 20, 8, 4.5)
    expect(v.pass).toBe(true)
    expect(v.ink).toBeNull()
  })

  it("sub-threshold effect dithering is not mistaken for ink", () => {
    // Every pixel shifts by ±3/channel (grain) — below the ink delta.
    const { withText, without } = pair(
      20,
      8,
      () => purple,
      () => rgb(purple.r + 3, purple.g - 3, purple.b + 3)
    )
    const v = aggregateInkSamples(withText, without, 20, 8, 4.5)
    expect(v.pass).toBe(true)
  })

  it("reports the measured ink color for the fixer", () => {
    const { withText, without } = pair(
      40,
      12,
      () => purple,
      (x, y) => (x % 4 < 2 && y > 2 && y < 10 ? teal : null)
    )
    const v = aggregateInkSamples(withText, without, 40, 12, 3.0)
    expect(v.ink!.r).toBeCloseTo(teal.r, 0)
    expect(v.ink!.g).toBeCloseTo(teal.g, 0)
    expect(v.ink!.b).toBeCloseTo(teal.b, 0)
  })
})
