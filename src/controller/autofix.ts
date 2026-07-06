// Layout auto-fix — turns lint findings (controller/lint.ts) into concrete
// `element.setLayout` nudges. Pure function, same layering as the lint:
// scene + measure in, CommandCall[] out — so it runs headless in tests and
// identically for the editor's auto-fix toggle.
//
// Strategy: place, don't shove. The fixer shares the lint's world model
// (collectEntries) so it sees every content box on the page, then runs a
// small free-space search per offender: candidate positions above/below/
// beside every obstacle plus the frame/container edges, each validated
// against ALL other content with the exact collision rule the lint would
// re-flag — a fix can therefore never trade one warning for a new one.
// The nearest valid spot wins, with horizontal moves slightly penalized
// (vertical restacking preserves column structure; sideways moves break
// alignment). Anchors, sizes, and stack configs survive — only dx/dy move
// (same invariant as layout.align). Flow children and locked nodes are never
// touched. One call resolves one lint pass; the caller re-lints and
// re-invokes until clean (fixes reflow text, so a bounded fix→measure→fix
// loop is the honest shape).
//
// Cost: entries n is tens for a real poster; the search is O(n) candidates ×
// O(n) validation per finding — comfortably instant.

import type { Box } from "../engine/backend"
import type { Scene, SceneNode } from "../scene/types"
import type { CommandCall } from "./dispatch"
import type { LintEntry, LintFinding } from "./lint"
import { boxesCollide, collectEntries, pairExcluded } from "./lint"
import { findNode, findParent } from "../scene/model"

/** Clearance left around a re-placed box — comfortably past the lint's
 *  minDepthPx so a fixed pair cannot re-flag on the next pass. */
const GAP = 12
/** Inset used when pulling a box back inside a frame/container — clears the
 *  lint's 2px edge tolerance. */
const INSET = 4
/** Horizontal moves are scored longer than they are: restacking vertically
 *  keeps column alignment; sliding sideways is the fix of last resort. */
const H_PENALTY = 1.25

export function autofixLayout(
  scene: Scene,
  measure: (id: string) => Box | null,
  findings: LintFinding[]
): CommandCall[] {
  const ctx = new FixContext(scene, measure)

  for (const f of findings) {
    if (f.kind === "overlap") {
      ctx.fixOverlap(f)
    } else {
      // frame-overflow ids: [node]; container-overflow ids: [text, container].
      // Both reduce to "bring the box back inside its bounds" — boundsFor
      // already intersects the frame with the node's own container.
      ctx.fixOverflow(f.ids[0])
    }
  }

  return ctx.emit()
}

/** Bounds a box's top-left corner may occupy (already shrunk by the box's
 *  own size). May be degenerate (min > max) when the box outsizes its
 *  container — candidates clamp toward min so the top/left edge stays
 *  readable, matching the lint's start-pinned philosophy. */
interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

class FixContext {
  private entries: LintEntry[]
  private byId = new Map<string, LintEntry>()
  /** Cumulative px deltas per node — later findings see earlier fixes. */
  private deltas = new Map<string, { dx: number; dy: number }>()

  constructor(
    private scene: Scene,
    private measure: (id: string) => Box | null
  ) {
    this.entries = collectEntries(scene, measure)
    for (const e of this.entries) this.byId.set(e.n.id, e)
  }

  /** Current box: measured box + every delta applied to the node OR any of
   *  its ancestors (moving a card carries its children with it). */
  private boxOf(e: LintEntry): Box {
    let dx = 0
    let dy = 0
    const own = this.deltas.get(e.n.id)
    if (own) {
      dx += own.dx
      dy += own.dy
    }
    for (const aid of e.ancestorIds) {
      const d = this.deltas.get(aid)
      if (d) {
        dx += d.dx
        dy += d.dy
      }
    }
    return dx || dy ? { x: e.box.x + dx, y: e.box.y + dy, w: e.box.w, h: e.box.h } : e.box
  }

  private nudge(id: string, dx: number, dy: number) {
    const d = this.deltas.get(id) ?? { dx: 0, dy: 0 }
    this.deltas.set(id, { dx: d.dx + dx, dy: d.dy + dy })
  }

  /** Everything a moved `m` could newly collide with, under lint pair rules
   *  (its own ancestors/descendants and flow-stack siblings never count). */
  private obstaclesFor(m: LintEntry): LintEntry[] {
    return this.entries.filter((e) => e !== m && !pairExcluded(m, e))
  }

  /** Frame bounds, intersected with the node's own card when it lives in one
   *  (so a fix can't cure an overlap by spilling text out of its container). */
  private boundsFor(m: LintEntry, w: number, h: number): Bounds {
    let minX = INSET
    let minY = INSET
    let maxX = this.scene.baseWidth - INSET - w
    let maxY = this.scene.baseHeight - INSET - h
    if (m.text && m.container && m.ancestorIds.has(m.container.n.id)) {
      const centry = this.byId.get(m.container.n.id)
      const c = centry ? this.boxOf(centry) : m.container.box
      minX = Math.max(minX, c.x + INSET)
      minY = Math.max(minY, c.y + INSET)
      maxX = Math.min(maxX, c.x + c.w - INSET - w)
      maxY = Math.min(maxY, c.y + c.h - INSET - h)
    }
    return { minX, minY, maxX, maxY }
  }

  /** Nearest collision-free position for m's box, starting the search from
   *  `desired`. Candidates: the desired spot itself, positions flush past
   *  each obstacle on all four sides, and the bounds edges — every one
   *  validated against every obstacle. Null when the page has no room. */
  private findSpot(m: LintEntry, desired: Box): { x: number; y: number } | null {
    const { w, h } = desired
    const bounds = this.boundsFor(m, w, h)
    const clampX = (x: number) =>
      Math.max(bounds.minX, Math.min(x, Math.max(bounds.minX, bounds.maxX)))
    const clampY = (y: number) =>
      Math.max(bounds.minY, Math.min(y, Math.max(bounds.minY, bounds.maxY)))

    const obstacles = this.obstaclesFor(m).map((o) => ({
      box: this.boxOf(o),
      text: o.text,
    }))

    const seen = new Set<string>()
    const candidates: Array<{ x: number; y: number }> = []
    const add = (x: number, y: number) => {
      x = clampX(x)
      y = clampY(y)
      const key = `${Math.round(x)}:${Math.round(y)}`
      if (!seen.has(key)) {
        seen.add(key)
        candidates.push({ x, y })
      }
    }

    add(desired.x, desired.y)
    for (const o of obstacles) {
      add(desired.x, o.box.y - GAP - h) // above the obstacle
      add(desired.x, o.box.y + o.box.h + GAP) // below
      add(o.box.x - GAP - w, desired.y) // left of it
      add(o.box.x + o.box.w + GAP, desired.y) // right of it
    }
    add(desired.x, bounds.minY)
    add(desired.x, bounds.maxY)
    add(bounds.minX, desired.y)
    add(bounds.maxX, desired.y)

    let best: { x: number; y: number; score: number } | null = null
    for (const c of candidates) {
      const box = { x: c.x, y: c.y, w, h }
      if (obstacles.some((o) => boxesCollide({ box, text: m.text }, o))) {
        continue
      }
      const score = Math.hypot(
        (c.x - desired.x) * H_PENALTY,
        c.y - desired.y
      )
      if (!best || score < best.score - 1e-6) best = { ...c, score }
    }
    return best && { x: best.x, y: best.y }
  }

  /** Move a colliding pair apart: pick the cheaper mover (smaller box first —
   *  less visual disruption; a card outsizes its label), search it a free
   *  spot, and only shove blindly when the whole page is out of room. */
  fixOverlap(f: LintFinding) {
    const a = this.byId.get(f.ids[0])
    const b = this.byId.get(f.ids[1])
    if (!a || !b) return
    const boxA = this.boxOf(a)
    const boxB = this.boxOf(b)
    // An earlier fix may already have separated this pair.
    if (
      !boxesCollide({ box: boxA, text: a.text }, { box: boxB, text: b.text })
    ) {
      return
    }

    const movers = [a, b]
      .filter((e) => isTranslatable(e.n))
      .sort(
        (m1, m2) =>
          this.boxOf(m1).w * this.boxOf(m1).h -
          this.boxOf(m2).w * this.boxOf(m2).h
      )
    for (const m of movers) {
      const from = this.boxOf(m)
      const spot = this.findSpot(m, from)
      if (spot) {
        this.nudge(m.n.id, spot.x - from.x, spot.y - from.y)
        return
      }
    }
    // No free spot for either — minimal push along the least-penetration
    // axis so at least the collision clears; the next lint pass re-judges.
    if (movers.length) {
      const m = movers[0]
      const other = m === a ? boxB : boxA
      const from = this.boxOf(m)
      const ow = overlap1d(from.x, from.w, other.x, other.w)
      const oh = overlap1d(from.y, from.h, other.y, other.h)
      const down = from.y + from.h / 2 >= other.y + other.h / 2
      if (ow <= oh) {
        this.nudge(m.n.id, (from.x >= other.x ? 1 : -1) * (ow + GAP), 0)
      } else {
        this.nudge(m.n.id, 0, (down ? 1 : -1) * (oh + GAP))
      }
    }
  }

  /** Bring an overflowing box back inside its bounds (frame and, for text in
   *  a card, the card). If the clamped spot is occupied, search around it —
   *  never cure an overflow by creating an overlap. */
  fixOverflow(id: string) {
    const e = this.byId.get(id)
    if (!e || !isTranslatable(e.n)) return
    const from = this.boxOf(e)
    const bounds = this.boundsFor(e, from.w, from.h)
    const desired = {
      x: Math.max(bounds.minX, Math.min(from.x, Math.max(bounds.minX, bounds.maxX))),
      y: Math.max(bounds.minY, Math.min(from.y, Math.max(bounds.minY, bounds.maxY))),
      w: from.w,
      h: from.h,
    }
    if (Math.abs(desired.x - from.x) < 0.5 && Math.abs(desired.y - from.y) < 0.5) {
      return // already inside (e.g. an earlier fix carried it back)
    }
    // Prefer a spot that's also collision-free; fall back to the plain clamp
    // (overflowing the frame is worse than a grazing overlap — the next pass
    // re-lints whatever remains).
    const spot = this.findSpot(e, desired) ?? desired
    this.nudge(e.n.id, spot.x - from.x, spot.y - from.y)
  }

  /** Deltas → element.setLayout calls (normalized against each parent). */
  emit(): CommandCall[] {
    const calls: CommandCall[] = []
    for (const [id, d] of this.deltas) {
      if (Math.abs(d.dx) < 0.5 && Math.abs(d.dy) < 0.5) continue
      const n = findNode(this.scene, id)
      if (!n || !isTranslatable(n)) continue
      const pb = this.parentBox(id)
      const layout = n.layout as Extract<
        SceneNode["layout"],
        { dx?: number; dy?: number }
      >
      calls.push({
        command: "element.setLayout",
        args: {
          id,
          layout: {
            ...layout,
            dx: round3((layout.dx ?? 0) + d.dx / pb.w),
            dy: round3((layout.dy ?? 0) + d.dy / pb.h),
          },
        },
      })
    }
    return calls
  }

  /** Parent container box (px) for converting px deltas to normalized offsets
   *  — same resolution as the drag write-back (engine/interaction.ts). */
  private parentBox(id: string): Box {
    const parent = findParent(this.scene, id)
    if (parent && parent.id !== this.scene.root.id) {
      const pb = this.measure(parent.id)
      if (pb && pb.w > 0 && pb.h > 0) return pb
    }
    return { x: 0, y: 0, w: this.scene.baseWidth, h: this.scene.baseHeight }
  }
}

/** Only anchored boxes can be translated: flow children are placed by their
 *  parent stack; an unanchored stack ignores dx/dy entirely. */
function isTranslatable(n: SceneNode): boolean {
  if (n.locked) return false
  if (n.layout.mode === "absolute") return true
  return n.layout.mode === "stack" && n.layout.anchor != null
}

function overlap1d(a: number, aw: number, b: number, bw: number): number {
  return Math.min(a + aw, b + bw) - Math.max(a, b)
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
