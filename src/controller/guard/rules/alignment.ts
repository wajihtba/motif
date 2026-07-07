// Alignment near-miss — an element 2–10px off a line its siblings already
// sit on (left/center/right edges, or the canvas centerline). Below the
// window is fine (sub-perceptual), above it is composition (don't fight the
// designer). Only SAME-KIND lines align (left↔left, center↔center …):
// snapping a left edge to a sibling's RIGHT edge is adjacency, not
// alignment, and would glue boxes together.
//
// Anti-oscillation: each finding names an anchor (the line's source node);
// anchors are never themselves flagged on that axis in the same pass, so
// two mutually-near-miss nodes converge instead of swapping places forever.

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

interface NudgeData {
  id: string
  dx: number
  dy: number
}

type Kind = "start" | "center" | "end"
const KINDS: Kind[] = ["start", "center", "end"]

const lineOf = (box: { x: number; w: number }, kind: Kind): number =>
  kind === "start" ? box.x : kind === "center" ? box.x + box.w / 2 : box.x + box.w

export const alignmentRule: DesignRule = {
  id: "alignment",
  title: "Alignment",
  description:
    "elements a few px off a line their siblings sit on (or off the canvas centerline)",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {
    /** Offsets below this are sub-perceptual — leave them. */
    minOffPx: 2,
    /** Offsets beyond this are composition, not sloppiness. */
    maxOffPx: 10,
  },
  lint(ctx: RuleContext): GuardFinding[] {
    const { minOffPx, maxOffPx } = ctx.thresholds
    const findings: GuardFinding[] = []
    // Per axis: nodes serving as an anchor (their line must stay put — never
    // flag them there) and nodes already getting a nudge (their line will
    // move — never align to them).
    const anchored = { x: new Set<string>(), y: new Set<string>() }
    const nudged = { x: new Set<string>(), y: new Set<string>() }

    for (const group of siblingGroups(ctx, isTranslatable).values()) {
      for (const m of group) {
        const others = group.filter((o) => o !== m)
        const best = (
          axis: "x" | "y"
        ): { delta: number; source: string | null } | null => {
          const view = (e: LintEntry) =>
            axis === "x"
              ? { x: e.box.x, w: e.box.w }
              : { x: e.box.y, w: e.box.h }
          let win: { delta: number; source: string | null } | null = null
          const consider = (delta: number, source: string | null) => {
            const abs = Math.abs(delta)
            if (abs < minOffPx || abs > maxOffPx) return
            if (!win || abs < Math.abs(win.delta)) win = { delta, source }
          }
          for (const o of others) {
            if (nudged[axis].has(o.n.id)) continue
            for (const kind of KINDS) {
              consider(lineOf(view(o), kind) - lineOf(view(m), kind), o.n.id)
            }
          }
          // Canvas centerline (center kind only — edges belong to the
          // edge-margin rule).
          const canvas =
            axis === "x" ? ctx.scene.baseWidth : ctx.scene.baseHeight
          consider(canvas / 2 - lineOf(view(m), "center"), null)
          return win
        }

        const wx = anchored.x.has(m.n.id) ? null : best("x")
        const wy = anchored.y.has(m.n.id) ? null : best("y")
        if (!wx && !wy) continue
        const dx = wx?.delta ?? 0
        const dy = wy?.delta ?? 0
        if (wx) {
          if (wx.source) anchored.x.add(wx.source)
          nudged.x.add(m.n.id)
        }
        if (wy) {
          if (wy.source) anchored.y.add(wy.source)
          nudged.y.add(m.n.id)
        }
        const to = [
          wx ? (wx.source ? `#${wx.source}` : "the canvas center") : null,
          wy ? (wy.source ? `#${wy.source}` : "the canvas center") : null,
        ]
          .filter(Boolean)
          .join(" and ")
        findings.push({
          rule: "alignment",
          kind: "alignment",
          ids: [m.n.id, ...(wx?.source ? [wx.source] : []), ...(wy?.source && wy.source !== wx?.source ? [wy.source] : [])],
          message: `${ref(m.n)} is ${[
            dx ? `${round(Math.abs(dx))}px horizontally` : null,
            dy ? `${round(Math.abs(dy))}px vertically` : null,
          ]
            .filter(Boolean)
            .join(" and ")} off alignment with ${to}`,
          data: { id: m.n.id, dx, dy } satisfies NudgeData,
        })
      }
    }
    return findings
  },
  autofix(findings, ctx) {
    const byId = new Map(ctx.entries.map((e) => [e.n.id, e]))
    const deltas = new Map<string, { dx: number; dy: number }>()
    for (const f of findings) {
      const { id, dx, dy } = f.data as NudgeData
      const e = byId.get(id)
      if (!e || deltas.has(id)) continue
      const box = movedBox(e.box, dx, dy)
      if (!insideFrame(ctx, box) || collidesAt(ctx, e, box)) continue
      deltas.set(id, { dx, dy })
    }
    return emitTranslations(ctx.scene, ctx.measure, deltas)
  },
}
