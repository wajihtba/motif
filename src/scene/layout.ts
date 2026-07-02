// Layout model — resolution-independent placement that compiles to real CSS.
//
// Motif is agent-first and multi-format: an LLM (and the UI) place elements by
// *intent* — "headline near the top, centered" — not by raw pixels that break
// when the canvas resizes. So the canonical position is an `anchor` + normalized
// offsets/size (fractions of the container), plus an auto-layout `stack` mode for
// flow. The browser does the actual layout (we paint the laid-out DOM into the
// canvas via drawElementImage), so `compileLayout` only has to emit CSS.
//
// Pixels remain reachable as an explicit escape hatch via `%` / `auto` sizes and
// raw `css`. `boxToLayout` converts a pixel rect ↔ normalized layout for the
// generator and for UI drag write-back.
//
// Ported near-verbatim from v1 (it is pure data → CSS); format variants (M6)
// lean on the same normalized model to re-place nodes per format.

export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export const ANCHORS: Anchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]

/** A size along one axis: a `number` is a fraction of the container (0..1); a
 *  `${n}%` string is a literal CSS percentage; `'auto'` sizes to content. */
export type Size = number | `${number}%` | "auto"

export type StackAlign = "start" | "center" | "end" | "stretch"
export type StackJustify = "start" | "center" | "end" | "between" | "around"

export type Layout =
  | {
      mode: "absolute"
      anchor: Anchor
      dx: number
      dy: number
      width: Size
      height: Size
    }
  | { mode: "flow" }
  | {
      mode: "stack"
      direction: "row" | "column"
      gap: number // px
      align: StackAlign
      justify: StackJustify
      wrap?: boolean
      padding?: number // px
      // A stack can also be positioned in its own parent like an absolute box:
      anchor?: Anchor
      dx?: number
      dy?: number
      width?: Size
      height?: Size
    }

// Anchor → fractional reference point (same value used for the container point
// and the element's own pivot, so 'bottom-right' pins the element's bottom-right
// corner to the container's bottom-right).
const HX: Record<Anchor, number> = {
  "top-left": 0,
  "center-left": 0,
  "bottom-left": 0,
  "top-center": 0.5,
  center: 0.5,
  "bottom-center": 0.5,
  "top-right": 1,
  "center-right": 1,
  "bottom-right": 1,
}
const VY: Record<Anchor, number> = {
  "top-left": 0,
  "top-center": 0,
  "top-right": 0,
  "center-left": 0.5,
  center: 0.5,
  "center-right": 0.5,
  "bottom-left": 1,
  "bottom-center": 1,
  "bottom-right": 1,
}

function sizeToCss(s: Size | undefined): string | undefined {
  if (s == null) return undefined
  if (s === "auto") return "auto"
  if (typeof s === "string") return s // `${n}%`
  return `${round(s * 100)}%`
}

const alignToCss: Record<StackAlign, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
}
const justifyToCss: Record<StackJustify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Positioning CSS for an anchored box (used by 'absolute' and positioned 'stack'). */
function placeAbsolute(
  anchor: Anchor,
  dx: number,
  dy: number
): Record<string, string> {
  const hx = HX[anchor]
  const vy = VY[anchor]
  return {
    position: "absolute",
    left: `${round((hx + dx) * 100)}%`,
    top: `${round((vy + dy) * 100)}%`,
    transform: `translate(${round(-hx * 100)}%, ${round(-vy * 100)}%)`,
  }
}

/** Compile a Layout to a CSS declaration record (camelCase) merged onto the node.
 *  `css.transform` from the layout is kept separate from animation transforms,
 *  which the renderer composes at paint time. */
export function compileLayout(layout: Layout): Record<string, string> {
  if (layout.mode === "flow") {
    // Sized/placed by the parent stack; nothing to position.
    return { position: "relative" }
  }
  if (layout.mode === "absolute") {
    const out = placeAbsolute(layout.anchor, layout.dx, layout.dy)
    const w = sizeToCss(layout.width)
    const h = sizeToCss(layout.height)
    if (w) out.width = w
    if (h) out.height = h
    return out
  }
  // stack
  const out: Record<string, string> = {
    display: "flex",
    flexDirection: layout.direction,
    gap: `${layout.gap}px`,
    alignItems: alignToCss[layout.align],
    justifyContent: justifyToCss[layout.justify],
  }
  if (layout.wrap) out.flexWrap = "wrap"
  if (layout.padding) out.padding = `${layout.padding}px`
  if (layout.anchor) {
    Object.assign(
      out,
      placeAbsolute(layout.anchor, layout.dx ?? 0, layout.dy ?? 0)
    )
  } else {
    out.position = "relative"
  }
  const w = sizeToCss(layout.width)
  const h = sizeToCss(layout.height)
  if (w) out.width = w
  if (h) out.height = h
  return out
}

// --- pixel ↔ normalized conversion (generator + UI drag write-back) ----------

/** Convert a pixel rect within a container to a normalized absolute layout.
 *  Generators can keep computing in pixels and normalize here. */
export function boxToLayout(
  x: number,
  y: number,
  w: number,
  h: number,
  cw: number,
  ch: number,
  anchor: Anchor = "top-left"
): Extract<Layout, { mode: "absolute" }> {
  // Express the offset from the chosen anchor's reference point.
  const hx = HX[anchor]
  const vy = VY[anchor]
  const px = x + w * hx // the element's own pivot point in px
  const py = y + h * vy
  return {
    mode: "absolute",
    anchor,
    dx: round(px / cw - hx),
    dy: round(py / ch - vy),
    width: round(w / cw),
    height: round(h / ch),
  }
}

/** Resolve an absolute layout back to a pixel rect within a container. */
export function layoutToBox(
  layout: Layout,
  cw: number,
  ch: number
): { x: number; y: number; w: number; h: number } | null {
  if (layout.mode === "flow") return null
  if (layout.mode === "stack" && !layout.anchor) return null
  const anchor =
    layout.mode === "absolute" ? layout.anchor : (layout.anchor ?? "top-left")
  const dx = layout.mode === "absolute" ? layout.dx : (layout.dx ?? 0)
  const dy = layout.mode === "absolute" ? layout.dy : (layout.dy ?? 0)
  const w = sizePx(layout.width, cw)
  const h = sizePx(layout.height, ch)
  const hx = HX[anchor]
  const vy = VY[anchor]
  const px = (hx + dx) * cw // pivot point in px
  const py = (vy + dy) * ch
  return { x: px - w * hx, y: py - h * vy, w, h }
}

function sizePx(s: Size | undefined, container: number): number {
  if (s == null || s === "auto") return 0
  if (typeof s === "string") {
    const n = parseFloat(s)
    return Number.isFinite(n) ? (n / 100) * container : 0
  }
  return s * container
}

export function defaultLayout(): Layout {
  return {
    mode: "absolute",
    anchor: "center",
    dx: 0,
    dy: 0,
    width: "auto",
    height: "auto",
  }
}
