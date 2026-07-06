// Drag snapping — pure geometry so the drag path stays testable headless.
// Candidates are the edges + centers of every static box (siblings, the
// canvas frame, the canvas center); the moving selection's union box snaps
// its own edges/center to the nearest candidate within a screen-constant
// threshold. One winner per axis; Alt bypasses in the interaction layer.

import type { Box } from "./backend"

export interface SnapLine {
  pos: number
  /** Source box the line came from — spans the drawn guide segment. */
  box: Box
}

export interface SnapCandidates {
  /** Vertical lines (x positions). */
  xs: SnapLine[]
  /** Horizontal lines (y positions). */
  ys: SnapLine[]
}

export interface SnapGuide {
  axis: "x" | "y"
  pos: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

/** Edge + center lines for a set of static boxes (plus the canvas frame —
 *  pass it as one of the boxes to get frame edges and canvas center). */
export function collectSnapLines(boxes: Box[]): SnapCandidates {
  const xs: SnapLine[] = []
  const ys: SnapLine[] = []
  for (const box of boxes) {
    xs.push(
      { pos: box.x, box },
      { pos: box.x + box.w / 2, box },
      { pos: box.x + box.w, box }
    )
    ys.push(
      { pos: box.y, box },
      { pos: box.y + box.h / 2, box },
      { pos: box.y + box.h, box }
    )
  }
  return { xs, ys }
}

/** Snap the moving box's left/center/right (top/center/bottom) to the nearest
 *  candidate line within `threshold` scene px. Returns the correction delta
 *  and the guide segments to draw (spanning both boxes). */
export function computeSnap(
  moving: Box,
  candidates: SnapCandidates,
  threshold: number
): SnapResult {
  const own = (a: number, size: number) => [a, a + size / 2, a + size]
  const best = (
    lines: SnapLine[],
    ownLines: number[]
  ): { delta: number; line: SnapLine } | null => {
    let win: { delta: number; line: SnapLine } | null = null
    for (const line of lines) {
      for (const o of ownLines) {
        const delta = line.pos - o
        if (Math.abs(delta) > threshold) continue
        if (!win || Math.abs(delta) < Math.abs(win.delta)) {
          win = { delta, line }
        }
      }
    }
    return win
  }

  const sx = best(candidates.xs, own(moving.x, moving.w))
  const sy = best(candidates.ys, own(moving.y, moving.h))
  const guides: SnapGuide[] = []
  if (sx) {
    guides.push({
      axis: "x",
      pos: sx.line.pos,
      from: Math.min(moving.y + (sy?.delta ?? 0), sx.line.box.y),
      to: Math.max(
        moving.y + moving.h + (sy?.delta ?? 0),
        sx.line.box.y + sx.line.box.h
      ),
    })
  }
  if (sy) {
    guides.push({
      axis: "y",
      pos: sy.line.pos,
      from: Math.min(moving.x + (sx?.delta ?? 0), sy.line.box.x),
      to: Math.max(
        moving.x + moving.w + (sx?.delta ?? 0),
        sy.line.box.x + sy.line.box.w
      ),
    })
  }
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides }
}
