// Zero-dependency CSS color utilities for the brand editor. The browser is
// the parser: any color the previews themselves can render (oklch, rgba, hex,
// named…) round-trips through a 1×1 canvas into sRGB bytes, so the native
// <input type="color"> can seed from arbitrary token strings. oklch → hex is
// a lossy gamut clamp — callers keep the text input authoritative and only
// write hex back when the user actually picks.

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

export function isCssColor(value: string): boolean {
  return typeof CSS !== "undefined" && CSS.supports("color", value)
}

let ctx: CanvasRenderingContext2D | null = null

function context2d(): CanvasRenderingContext2D | null {
  if (!ctx) {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext("2d", { willReadFrequently: true })
  }
  return ctx
}

/** Parse any CSS color the browser understands into sRGB bytes + alpha. */
export function cssColorToRgba(value: string): Rgba | null {
  if (typeof document === "undefined" || !isCssColor(value)) return null
  const c = context2d()
  if (!c) return null
  c.clearRect(0, 0, 1, 1)
  c.fillStyle = "#000" // reset — an invalid assignment keeps the previous fillStyle
  c.fillStyle = value
  c.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: a / 255 }
}

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0")

/** "#rrggbb" for the native picker, plus the parsed alpha (0..1). */
export function cssColorToHex(
  value: string
): { hex: string; alpha: number } | null {
  const rgba = cssColorToRgba(value)
  if (!rgba) return null
  return {
    hex: `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`,
    alpha: rgba.a,
  }
}

/** What the picker writes back: "#rrggbb", or "#rrggbbaa" when alpha < 1. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
  return a >= 255 ? hex : `${hex}${hex2(a)}`
}
