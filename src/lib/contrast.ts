// Pure contrast math — zero DOM, zero deps. The DOM-backed parser stays in
// css-color.ts; everything here is closed-form over Rgba so it runs identically
// in vitest/jsdom and the browser. WCAG 2.x is the scoring seam
// (contrastRatio + requiredRatio) so APCA could swap in later without touching
// callers.

import type { Rgba } from "./css-color"

// --- WCAG ------------------------------------------------------------------

function linearize(byte: number): number {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance of an sRGB color (alpha ignored). */
export function relativeLuminance(c: Rgba): number {
  return (
    0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b)
  )
}

/** WCAG contrast ratio, symmetric, 1..21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG AA threshold: 3:1 for large text (≥24px, or ≥18.66px bold), else 4.5:1. */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)
  return large ? 3.0 : 4.5
}

// --- compositing -----------------------------------------------------------

/** Source-over: fg composited onto bg. */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const fa = fg.a
  const ba = bg.a
  const a = fa + ba * (1 - fa)
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const ch = (f: number, b_: number) => (f * fa + b_ * ba * (1 - fa)) / a
  return { r: ch(fg.r, bg.r), g: ch(fg.g, bg.g), b: ch(fg.b, bg.b), a }
}

// --- OKLCH (Björn Ottosson's oklab, self-contained — no color lib) ----------

export interface Oklch {
  /** 0..1 perceptual lightness */
  l: number
  /** chroma, 0..~0.37 in sRGB gamut */
  c: number
  /** hue in degrees, 0..360 */
  h: number
}

function rgbToOklab(c: Rgba): { L: number; a: number; b: number } {
  const r = linearize(c.r)
  const g = linearize(c.g)
  const b = linearize(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function delinearize(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return v * 255
}

/** Inverse oklab → linear sRGB channels (may be out of [0,1] when out of gamut). */
function oklabToLinear(L: number, a: number, b: number) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

export function rgbaToOklch(c: Rgba): Oklch {
  const { L, a, b } = rgbToOklab(c)
  const chroma = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c: chroma, h }
}

function inGamut(lin: { r: number; g: number; b: number }): boolean {
  const eps = 1e-6
  return (
    lin.r >= -eps &&
    lin.r <= 1 + eps &&
    lin.g >= -eps &&
    lin.g <= 1 + eps &&
    lin.b >= -eps &&
    lin.b <= 1 + eps
  )
}

/** OKLCH → sRGB. Out-of-gamut colors are clamped by reducing chroma (hue and
 *  lightness preserved), the standard CSS gamut-mapping direction. */
export function oklchToRgba(c: Oklch, alpha = 1): Rgba {
  const rad = (c.h * Math.PI) / 180
  const toLin = (chroma: number) =>
    oklabToLinear(c.l, chroma * Math.cos(rad), chroma * Math.sin(rad))
  let lin = toLin(c.c)
  if (!inGamut(lin)) {
    let lo = 0
    let hi = c.c
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(toLin(mid))) lo = mid
      else hi = mid
    }
    lin = toLin(lo)
  }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  return {
    r: delinearize(clamp01(lin.r)),
    g: delinearize(clamp01(lin.g)),
    b: delinearize(clamp01(lin.b)),
    a: alpha,
  }
}

/** Move a text color's OKLCH lightness away from the backdrop until the
 *  composited result reaches `target` contrast — hue kept, chroma reduced only
 *  by gamut clamping, alpha preserved. Prefers the direction the color already
 *  sits on; falls back to the opposite pole. Returns the passing color closest
 *  to the original lightness, or null when neither pole can reach `target`
 *  (the fix ladder then falls through to scrim/halo). Deterministic. */
export function adjustLightnessForContrast(
  text: Rgba,
  backdrop: Rgba,
  target: number
): Rgba | null {
  const lch = rgbaToOklch(text)
  // Judge candidates as they will actually render — quantized to sRGB bytes.
  // A float that scrapes past the target can round to a hex that fails.
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const colorAt = (l: number): Rgba => {
    const c = oklchToRgba({ ...lch, l }, text.a)
    return { r: q(c.r), g: q(c.g), b: q(c.b), a: c.a }
  }
  const ratioAt = (l: number) => {
    const candidate = colorAt(l)
    return contrastRatio(compositeOver(candidate, backdrop), backdrop)
  }
  if (ratioAt(lch.l) >= target) return colorAt(lch.l)

  const preferred: [number, number] =
    relativeLuminance(text) >= relativeLuminance(backdrop) ? [1, 0] : [0, 1]
  for (const pole of preferred) {
    if (ratioAt(pole) < target) continue
    // Contrast grows monotonically as L moves from the original toward the
    // passing pole — binary-search the closest passing lightness.
    let fail = lch.l
    let pass = pole
    for (let i = 0; i < 24; i++) {
      const mid = (fail + pass) / 2
      if (ratioAt(mid) >= target) pass = mid
      else fail = mid
    }
    return colorAt(pass)
  }
  return null
}

// --- tier-2 sample aggregation ----------------------------------------------

export interface SampleVerdict {
  pass: boolean
  /** The worst block's median contrast ratio. */
  worstRatio: number
  /** Fraction of individual samples below the required ratio. */
  failFrac: number
  /** Channel-wise median backdrop color — representative for the fix ladder. */
  medianBackdrop: Rgba
  /** Measured rendered ink color (ink-diff mode only) — the real glyph color
   *  after effects/filters, which css math cannot know. */
  ink?: Rgba | null
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Judge a grid of backdrop samples against a text color. The grid is split
 *  into (≤4)×(≤2) blocks; a block fails when the MEDIAN contrast of its
 *  samples is below `required` — medians shrug off grain/noise, blocks catch
 *  the washed-out corner a whole-region average would hide. */
export function aggregateSamples(
  pixels: Rgba[],
  gridW: number,
  gridH: number,
  textColor: Rgba,
  required: number
): SampleVerdict {
  const ratios = pixels.map((p) => {
    const bg = { ...p, a: 1 }
    return contrastRatio(compositeOver(textColor, bg), bg)
  })
  const cols = Math.min(4, Math.max(1, gridW))
  const rows = Math.min(2, Math.max(1, gridH))
  const blocks: number[][] = Array.from({ length: cols * rows }, () => [])
  for (let y = 0; y < gridH; y++) {
    const by = Math.min(rows - 1, Math.floor((y * rows) / gridH))
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      if (i >= ratios.length) break
      const bx = Math.min(cols - 1, Math.floor((x * cols) / gridW))
      blocks[by * cols + bx].push(ratios[i])
    }
  }
  let worstRatio = Infinity
  for (const block of blocks) {
    if (!block.length) continue
    worstRatio = Math.min(worstRatio, median(block))
  }
  if (worstRatio === Infinity) worstRatio = 21
  const failCount = ratios.filter((r) => r < required).length
  return {
    pass: worstRatio >= required,
    worstRatio,
    failFrac: ratios.length ? failCount / ratios.length : 0,
    medianBackdrop: {
      r: median(pixels.map((p) => p.r)),
      g: median(pixels.map((p) => p.g)),
      b: median(pixels.map((p) => p.b)),
      a: 1,
    },
  }
}

// --- ink-diff aggregation ----------------------------------------------------
//
// For text whose rendered color css math cannot know — element shaders/filters
// on the glyphs, canvas-wide effects, unparsable gradient fills — readability
// is judged from the pixels themselves: the same region rendered WITH and
// WITHOUT the text. Changed pixels are the ink (glyphs + shadows); each is
// scored against the true backdrop pixel underneath it.

/** Channel-sum delta before a pixel counts as ink — rejects effect dithering
 *  and compression noise without missing anti-aliased strokes. */
const INK_DELTA = 24
/** Blocks with fewer ink pixels than this carry no verdict (no text there). */
const MIN_INK_PER_BLOCK = 4

const isInk = (a: Rgba, b: Rgba): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > INK_DELTA

/** 90th percentile — the strongest ink pixels are the glyph cores; edge
 *  anti-aliasing always blends toward the backdrop and must not drag an
 *  otherwise-readable glyph into a false flag. */
const p90 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))]
}

/** Judge rendered ink against its true backdrop. `withText`/`without` are the
 *  same region sampled from a frame with the text visible and one with it
 *  hidden. A block fails when even its BEST ink pixels (p90) sit below the
 *  required ratio against the pixels they cover — if the glyph cores can't be
 *  told from the backdrop, nothing can. A halo/shadow that genuinely carries
 *  the glyph shape registers as high-contrast ink and passes, matching how it
 *  reads. No ink anywhere (text invisible at this frame) → pass. */
export function aggregateInkSamples(
  withText: Rgba[],
  without: Rgba[],
  gridW: number,
  gridH: number,
  required: number
): SampleVerdict {
  if (!withText.length || !without.length) {
    return {
      pass: true,
      worstRatio: 21,
      failFrac: 0,
      medianBackdrop: { r: 0, g: 0, b: 0, a: 1 },
      ink: null,
    }
  }
  const cols = Math.min(4, Math.max(1, gridW))
  const rows = Math.min(2, Math.max(1, gridH))
  const blocks: Array<Array<{ ratio: number; px: Rgba }>> = Array.from(
    { length: cols * rows },
    () => []
  )
  const n = Math.min(withText.length, without.length, gridW * gridH)
  for (let y = 0; y < gridH; y++) {
    const by = Math.min(rows - 1, Math.floor((y * rows) / gridH))
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      if (i >= n) break
      const a = withText[i]
      const b = without[i]
      if (!isInk(a, b)) continue
      const bx = Math.min(cols - 1, Math.floor((x * cols) / gridW))
      blocks[by * cols + bx].push({ ratio: contrastRatio(a, b), px: a })
    }
  }

  let worstRatio = Infinity
  let inkCount = 0
  let failCount = 0
  const strongest: Array<{ ratio: number; px: Rgba }> = []
  for (const block of blocks) {
    inkCount += block.length
    failCount += block.filter((s) => s.ratio < required).length
    strongest.push(...block)
    if (block.length < MIN_INK_PER_BLOCK) continue
    worstRatio = Math.min(worstRatio, p90(block.map((s) => s.ratio)))
  }
  if (worstRatio === Infinity) worstRatio = 21 // no visible ink → nothing to read

  // Representative ink = channel-median of the top-decile-contrast pixels
  // (the glyph cores), for the fixer's pole/verification math.
  strongest.sort((a, b) => b.ratio - a.ratio)
  const core = strongest.slice(
    0,
    Math.max(1, Math.floor(strongest.length / 10))
  )
  const ink: Rgba | null = core.length
    ? {
        r: median(core.map((s) => s.px.r)),
        g: median(core.map((s) => s.px.g)),
        b: median(core.map((s) => s.px.b)),
        a: 1,
      }
    : null

  return {
    pass: worstRatio >= required,
    worstRatio,
    failFrac: inkCount ? failCount / inkCount : 0,
    medianBackdrop: {
      r: median(without.map((p) => p.r)),
      g: median(without.map((p) => p.g)),
      b: median(without.map((p) => p.b)),
      a: 1,
    },
    ink,
  }
}
