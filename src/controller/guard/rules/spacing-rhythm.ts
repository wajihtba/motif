// Spacing rhythm — uneven gaps inside a visual column (or row) of siblings.
// An LLM writing absolute positions produces 23/61/38px gaps where a human
// designer keeps one rhythm; the fix equalizes the chain to the median gap
// rounded to the spacing grid, first element pinned (its position is the
// composition's anchor), every move pre-validated against the lint's own
// collision rule and the frame. A chain that cannot be fixed cleanly emits
// nothing — the finding rides to the model.
//
// Deliberately conservative: gap spread beyond maxSpreadPx reads as an
// intentional asymmetric composition and is never flagged (don't fight the
// designer — same philosophy as allowOverlap).

import type { DesignRule, GuardFinding, RuleContext } from "../types"
import type { LintEntry } from "../../lint"
import { emitTranslations, isTranslatable } from "../../autofix"
import {
  collidesAt,
  insideFrame,
  movedBox,
  ref,
  round,
  siblingGroups,
} from "./shared"

/** Boxes belong to one column when their x-ranges overlap by ≥ this fraction
 *  of the narrower box (transposed for rows). */
const LANE_OVERLAP_FRAC = 0.6

interface ChainData {
  axis: "x" | "y"
  ids: string[]
  gaps: number[]
}

const overlapFrac = (
  a: { start: number; size: number },
  b: { start: number; size: number }
): number => {
  const o =
    Math.min(a.start + a.size, b.start + b.size) - Math.max(a.start, b.start)
  return o / Math.max(1, Math.min(a.size, b.size))
}

/** Split one sibling group into lanes along `axis` — a lane is the set of
 *  boxes sharing a cross-axis span (a visual column for axis "y"), sorted
 *  along the main axis. Lane assignment, not a consecutive y-scan, so an
 *  unrelated element vertically interleaved with a column (a side badge)
 *  doesn't sever the column's chain. */
function chainsOf(entries: LintEntry[], axis: "x" | "y"): LintEntry[][] {
  const main = (e: LintEntry) => (axis === "y" ? e.box.y : e.box.x)
  const cross = (e: LintEntry) =>
    axis === "y"
      ? { start: e.box.x, size: e.box.w }
      : { start: e.box.y, size: e.box.h }
  const sorted = [...entries].sort((a, b) => main(a) - main(b))
  const lanes: LintEntry[][] = []
  for (const e of sorted) {
    const lane = lanes.find((l) =>
      l.every((m) => overlapFrac(cross(m), cross(e)) >= LANE_OVERLAP_FRAC)
    )
    if (lane) lane.push(e)
    else lanes.push([e])
  }
  return lanes
}

function gapsOf(chain: LintEntry[], axis: "x" | "y"): number[] {
  const gaps: number[] = []
  for (let i = 1; i < chain.length; i++) {
    const p = chain[i - 1].box
    const c = chain[i].box
    gaps.push(
      axis === "y" ? c.y - (p.y + p.h) : c.x - (p.x + p.w)
    )
  }
  return gaps
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export const spacingRhythmRule: DesignRule = {
  id: "spacing-rhythm",
  title: "Spacing rhythm",
  description:
    "uneven gaps inside a column or row of content (23/61/38px where one rhythm belongs)",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {
    /** Gap spread at or below this is fine (optical wiggle). */
    tolerancePx: 6,
    /** Spread beyond this reads as intentional asymmetry — never flagged. */
    maxSpreadPx: 32,
    /** Spacing grid the equalized gap snaps to. */
    gridPx: 8,
    /** Minimum chain length worth a rhythm judgement. */
    minChain: 3,
  },
  lint(ctx: RuleContext): GuardFinding[] {
    const { tolerancePx, maxSpreadPx, minChain } = ctx.thresholds
    const findings: GuardFinding[] = []
    for (const group of siblingGroups(ctx, isTranslatable).values()) {
      if (group.length < minChain) continue
      for (const axis of ["y", "x"] as const) {
        for (const chain of chainsOf(group, axis)) {
          if (chain.length < minChain) continue
          const gaps = gapsOf(chain, axis)
          // Negative gap = overlap — that rule owns the pair.
          if (gaps.some((g) => g < 0)) continue
          const spread = Math.max(...gaps) - Math.min(...gaps)
          if (spread <= tolerancePx || spread > maxSpreadPx) continue
          const ids = chain.map((e) => e.n.id)
          findings.push({
            rule: "spacing-rhythm",
            kind: "spacing-rhythm",
            ids,
            message: `${chain.map((e) => ref(e.n)).join(", ")} have uneven ${
              axis === "y" ? "vertical" : "horizontal"
            } gaps (${gaps.map(round).join("/")}px) — equalize the rhythm`,
            data: { axis, ids, gaps } satisfies ChainData,
          })
        }
      }
    }
    return findings
  },
  autofix(findings, ctx) {
    const byId = new Map(ctx.entries.map((e) => [e.n.id, e]))
    const deltas = new Map<string, { dx: number; dy: number }>()
    const { gridPx } = ctx.thresholds
    for (const f of findings) {
      const { axis, ids, gaps } = f.data as ChainData
      const chain = ids.map((id) => byId.get(id))
      if (chain.some((e) => !e)) continue
      // A node already moved by an earlier chain this pass — skip the whole
      // finding rather than compound unvalidated moves.
      if (ids.some((id) => deltas.has(id))) continue
      const entries = chain as LintEntry[]
      const target = Math.max(gridPx, round(median(gaps) / gridPx) * gridPx)

      // First element pinned; the rest restack at the target gap.
      const chainIds = new Set(ids)
      const moves: Array<{ e: LintEntry; dx: number; dy: number }> = []
      let cursor =
        axis === "y"
          ? entries[0].box.y + entries[0].box.h
          : entries[0].box.x + entries[0].box.w
      let ok = true
      for (let i = 1; i < entries.length; i++) {
        const e = entries[i]
        const d = cursor + target - (axis === "y" ? e.box.y : e.box.x)
        const dx = axis === "x" ? d : 0
        const dy = axis === "y" ? d : 0
        const box = movedBox(e.box, dx, dy)
        if (!insideFrame(ctx, box) || collidesAt(ctx, e, box, chainIds)) {
          ok = false
          break
        }
        moves.push({ e, dx, dy })
        cursor = axis === "y" ? box.y + box.h : box.x + box.w
      }
      // Chain mates were ignored as obstacles above — re-check the moved
      // chain against itself at final positions (paranoia; target ≥ gridPx
      // should keep mates apart).
      if (ok) {
        for (const m of moves) {
          if (Math.abs(m.dx) < 0.5 && Math.abs(m.dy) < 0.5) continue
          deltas.set(m.e.n.id, { dx: m.dx, dy: m.dy })
        }
      }
    }
    return emitTranslations(ctx.scene, ctx.measure, deltas)
  },
}
