// Design-guard registry — rule filtering, threshold merge, adapter parity
// with the legacy lintLayout output, and per-rule autofix routing.

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { SceneNode } from "@/scene/types"
import type { GuardConfig } from "@/controller/guard/types"
import { DEFAULT_GUARD_CONFIG } from "@/controller/guard/types"
import {
  DESIGN_RULES,
  buildRuleContext,
  enabledRules,
  guardAutofix,
  guardText,
  mergedThresholds,
  ruleById,
  runSyncRules,
} from "@/controller/guard/registry"
import { lintLayout, lintText } from "@/controller/lint"
import { autofixLayout } from "@/controller/autofix"
import { emptyScene, node } from "@/scene/model"

function sceneWith(children: SceneNode[]) {
  const s = emptyScene() // 1080×1080
  s.root.children = children
  return s
}

function measurer(boxes: Record<string, Box>) {
  return (id: string): Box | null => boxes[id] ?? null
}

const text = (id: string, extra: Partial<SceneNode> = {}) =>
  node({ id, role: "headline", html: "Slow Roast Sunday", ...extra })

const config = (patch: Partial<GuardConfig> = {}): GuardConfig => ({
  ...DEFAULT_GUARD_CONFIG,
  ...patch,
})

// Two overlapping text leaves + one overflowing the frame — exercises two
// distinct core rules at once.
const OVERLAP_SCENE = () => sceneWith([text("a"), text("b"), text("edge")])
const OVERLAP_BOXES = {
  a: { x: 100, y: 100, w: 400, h: 120 },
  b: { x: 120, y: 180, w: 400, h: 60 },
  edge: { x: 900, y: 500, w: 400, h: 80 }, // 220px past the right edge
}

describe("registry", () => {
  it("adapters reproduce lintLayout exactly (same findings, same text)", () => {
    const s = OVERLAP_SCENE()
    const measure = measurer(OVERLAP_BOXES)
    const legacy = lintLayout(s, measure)
    const ctx = buildRuleContext(s, measure)
    const guard = runSyncRules(ctx, config())
    expect(guard.map((f) => ({ kind: f.kind, ids: f.ids, message: f.message })))
      .toEqual(legacy)
    expect(guardText(guard)).toEqual(lintText(legacy))
  })

  it("disabling a rule removes its findings only", () => {
    const s = OVERLAP_SCENE()
    const ctx = buildRuleContext(s, measurer(OVERLAP_BOXES))
    const all = runSyncRules(ctx, config())
    expect(all.map((f) => f.rule).sort()).toEqual(["frame-overflow", "overlap"])
    const noOverlap = runSyncRules(
      ctx,
      config({ rules: { overlap: { enabled: false } } })
    )
    expect(noOverlap.map((f) => f.rule)).toEqual(["frame-overflow"])
  })

  it("merges user threshold overrides over rule defaults", () => {
    const overlap = ruleById("overlap")!
    expect(mergedThresholds(overlap, config()).minDepthPx).toBe(8)
    const merged = mergedThresholds(
      overlap,
      config({ rules: { overlap: { thresholds: { minDepthPx: 40 } } } })
    )
    expect(merged.minDepthPx).toBe(40)
    expect(merged.textDepthPx).toBe(4) // untouched default survives
  })

  it("threshold overrides reach the rule (looser overlap stops flagging)", () => {
    const s = sceneWith([text("a"), text("b")])
    const ctx = buildRuleContext(
      s,
      measurer({
        a: { x: 100, y: 100, w: 400, h: 120 },
        b: { x: 120, y: 180, w: 400, h: 60 }, // 40px deep collision
      })
    )
    expect(runSyncRules(ctx, config())).toHaveLength(1)
    const loose = config({
      rules: { overlap: { thresholds: { textDepthPx: 60, minDepthPx: 60 } } },
    })
    expect(runSyncRules(ctx, loose)).toHaveLength(0)
  })

  it("core-rule findings route to one shared autofixLayout call", () => {
    const s = OVERLAP_SCENE()
    const measure = measurer(OVERLAP_BOXES)
    const ctx = buildRuleContext(s, measure)
    const findings = runSyncRules(ctx, config())
    const calls = guardAutofix(findings, ctx, config())
    expect(calls).toEqual(autofixLayout(s, measure, lintLayout(s, measure)))
    expect(calls.length).toBeGreaterThan(0)
  })

  it("enabledRules filters by tier", () => {
    expect(enabledRules(config(), "async").map((r) => r.id)).toEqual([
      "low-contrast",
    ])
    expect(
      enabledRules(config(), "sync").every((r) => r.tier === "sync")
    ).toBe(true)
  })

  it("every rule id is unique", () => {
    const ids = DESIGN_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
