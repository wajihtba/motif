// Resize geometry — pure math so the whole handle grid stays testable headless,
// exactly like snap.ts. The interaction layer feeds a start box + a pointer
// delta + modifier flags and applies the returned box; nothing here touches the
// DOM. Corners resize two edges, sides resize one; the OPPOSITE edge/corner is
// the fixed anchor (Alt makes the box grow symmetrically about its center),
// Shift locks the aspect ratio, and a min size stops the box from inverting.

import type { Box } from "./backend"
import type { SnapCandidates, SnapGuide } from "./snap"

/** Eight resize handles, compass-named. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

/** Which horizontal edge a handle drives: -1 west, +1 east, 0 none. */
const HDIR: Record<Handle, -1 | 0 | 1> = {
  nw: -1,
  n: 0,
  ne: 1,
  e: 1,
  se: 1,
  s: 0,
  sw: -1,
  w: -1,
}
/** Which vertical edge a handle drives: -1 north, +1 south, 0 none. */
const VDIR: Record<Handle, -1 | 0 | 1> = {
  nw: -1,
  n: -1,
  ne: -1,
  e: 0,
  se: 1,
  s: 1,
  sw: 1,
  w: 0,
}

export const CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
}

export interface ResizeOpts {
  /** Minimum width/height in scene px — the box never shrinks past this. */
  min: number
  /** Shift: preserve the start box's aspect ratio. */
  aspect?: boolean
  /** Alt: grow symmetrically about the box center (both edges move). */
  center?: boolean
}

/** New box for a handle dragged by (dx, dy) scene px from `start`. The edge(s)
 *  the handle owns move; the opposite edge stays put (or, with `center`, the
 *  center stays put). Never returns a width/height below `min`. */
export function resizeBox(
  start: Box,
  handle: Handle,
  dx: number,
  dy: number,
  opts: ResizeOpts
): Box {
  const hd = HDIR[handle]
  const vd = VDIR[handle]
  const k = opts.center ? 2 : 1

  let w = hd !== 0 ? start.w + hd * dx * k : start.w
  let h = vd !== 0 ? start.h + vd * dy * k : start.h

  if (opts.aspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h
    if (hd !== 0 && vd !== 0) {
      // Corner: scale uniformly by whichever axis moved proportionally more.
      const s =
        Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)
          ? w / start.w
          : h / start.h
      w = start.w * s
      h = start.h * s
    } else if (hd !== 0) {
      h = w / ratio
    } else if (vd !== 0) {
      w = h * ratio
    }
  }

  w = Math.max(opts.min, w)
  h = Math.max(opts.min, h)

  return {
    x: placeAxis(start.x, start.w, w, hd, opts.center),
    y: placeAxis(start.y, start.h, h, vd, opts.center),
    w,
    h,
  }
}

/** Position one axis' origin so the correct edge stays fixed. With `center`
 *  (or a handle that doesn't drive this axis but whose size changed via aspect
 *  lock) the box stays centered on its original mid-point. */
function placeAxis(
  origin: number,
  startSize: number,
  size: number,
  dir: -1 | 0 | 1,
  center?: boolean
): number {
  if (center || dir === 0) return origin + startSize / 2 - size / 2
  if (dir < 0) return origin + startSize - size // grow toward the fixed +edge
  return origin // fixed -edge
}

/** Snap the handle's MOVING edges to nearby static lines (siblings + frame),
 *  the resize counterpart of drag snapping. Only the edge(s) the handle owns
 *  snap; aspect/center resizes skip snapping (their coupled edges make a single
 *  edge-snap ambiguous). Returns the corrected box and the guide segments. */
export function snapResize(
  box: Box,
  start: Box,
  handle: Handle,
  candidates: SnapCandidates,
  threshold: number,
  opts: Pick<ResizeOpts, "aspect" | "center" | "min">
): { box: Box; guides: SnapGuide[] } {
  if (opts.aspect || opts.center) return { box, guides: [] }
  const hd = HDIR[handle]
  const vd = VDIR[handle]
  const guides: SnapGuide[] = []
  const out = { ...box }

  if (hd !== 0) {
    const edge = hd < 0 ? out.x : out.x + out.w
    const win = nearest(candidates.xs, edge, threshold)
    if (win) {
      if (hd < 0) {
        out.x = win.pos
        out.w = Math.max(opts.min, start.x + start.w - win.pos)
      } else {
        out.w = Math.max(opts.min, win.pos - out.x)
      }
      guides.push({
        axis: "x",
        pos: win.pos,
        from: Math.min(out.y, win.box.y),
        to: Math.max(out.y + out.h, win.box.y + win.box.h),
      })
    }
  }
  if (vd !== 0) {
    const edge = vd < 0 ? out.y : out.y + out.h
    const win = nearest(candidates.ys, edge, threshold)
    if (win) {
      if (vd < 0) {
        out.y = win.pos
        out.h = Math.max(opts.min, start.y + start.h - win.pos)
      } else {
        out.h = Math.max(opts.min, win.pos - out.y)
      }
      guides.push({
        axis: "y",
        pos: win.pos,
        from: Math.min(out.x, win.box.x),
        to: Math.max(out.x + out.w, win.box.x + win.box.w),
      })
    }
  }
  return { box: out, guides }
}

function nearest(
  lines: SnapCandidates["xs"],
  edge: number,
  threshold: number
): SnapCandidates["xs"][number] | null {
  let win: SnapCandidates["xs"][number] | null = null
  let winDelta = Infinity
  for (const line of lines) {
    const d = Math.abs(line.pos - edge)
    if (d <= threshold && d < winDelta) {
      win = line
      winDelta = d
    }
  }
  return win
}
