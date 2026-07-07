// Shared geometry for guard-native rules: proposed-placement validation
// against the exact lint collision rule (a fix must never trade one warning
// for a new one), frame containment, and the finding-message node ref.

import type { Box } from "../../../engine/backend"
import type { SceneNode } from "../../../scene/types"
import type { LintEntry } from "../../lint"
import type { RuleContext } from "../types"
import { boxesCollide, pairExcluded } from "../../lint"

/** Inset a moved box keeps from the frame — clears the lint's edge slack
 *  (same constant as autofix.ts INSET). */
export const FRAME_INSET = 4

export function ref(n: SceneNode): string {
  return n.role ? `#${n.id} (${n.role})` : `#${n.id}`
}

export const round = (v: number): number => Math.round(v)

export function movedBox(box: Box, dx: number, dy: number): Box {
  return dx || dy ? { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h } : box
}

/** Would `box` (a proposed position for `m`) collide with any other entry?
 *  `ignore` holds ids moving in the same fix (chain mates) — their OLD boxes
 *  must not count as obstacles. Pair exclusions match the lint exactly. */
export function collidesAt(
  ctx: RuleContext,
  m: LintEntry,
  box: Box,
  ignore?: ReadonlySet<string>
): boolean {
  return ctx.entries.some(
    (o) =>
      o !== m &&
      !ignore?.has(o.n.id) &&
      !pairExcluded(m, o) &&
      boxesCollide({ box, text: m.text }, { box: o.box, text: o.text })
  )
}

export function insideFrame(ctx: RuleContext, box: Box): boolean {
  return (
    box.x >= FRAME_INSET - 0.5 &&
    box.y >= FRAME_INSET - 0.5 &&
    box.x + box.w <= ctx.scene.baseWidth - FRAME_INSET + 0.5 &&
    box.y + box.h <= ctx.scene.baseHeight - FRAME_INSET + 0.5
  )
}

/** Translatable entries grouped by parent — sibling groups are the working
 *  set for spacing and alignment (flow children are placed by their stack
 *  and never translated; the lint already excludes them pairwise). */
export function siblingGroups(
  ctx: RuleContext,
  translatable: (n: SceneNode) => boolean
): Map<SceneNode | null, LintEntry[]> {
  const groups = new Map<SceneNode | null, LintEntry[]>()
  for (const e of ctx.entries) {
    if (!translatable(e.n)) continue
    const list = groups.get(e.parent)
    if (list) list.push(e)
    else groups.set(e.parent, [e])
  }
  return groups
}
