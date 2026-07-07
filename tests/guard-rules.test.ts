// Guard-native rule goldens — spacing-rhythm, alignment, edge-margin —
// pure scenes + Map-backed measure, pinning what is and is NOT a violation
// and that every autofix lands on the exact target geometry (or refuses
// when a collision would trade one warning for another).

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { SceneNode } from "@/scene/types"
import type { CommandCall } from "@/controller/dispatch"
import type { GuardFinding, RuleContext } from "@/controller/guard/types"
import { DEFAULT_GUARD_CONFIG } from "@/controller/guard/types"
import {
  buildRuleContext,
  mergedThresholds,
  ruleById,
} from "@/controller/guard/registry"
import { emptyScene, node } from "@/scene/model"

function sceneWith(children: SceneNode[]) {
  const s = emptyScene() // 1080×1080, format ig-post (safe 72)
  s.root.children = children
  return s
}

function measurer(boxes: Record<string, Box | undefined>) {
  return (id: string): Box | null => boxes[id] ?? null
}

const text = (id: string, extra: Partial<SceneNode> = {}) =>
  node({ id, role: "headline", html: "Slow Roast Sunday", ...extra })

/** Context with the rule's merged default thresholds baked in. */
function ctxFor(
  ruleId: "spacing-rhythm" | "alignment" | "edge-margin" | "text-clip",
  children: SceneNode[],
  boxes: Record<string, Box | undefined>,
  extras: { probeScroll?: RuleContext["probeScroll"] } = {}
): { ctx: RuleContext; lint: () => GuardFinding[]; fix: (f: GuardFinding[]) => CommandCall[] } {
  const rule = ruleById(ruleId)!
  const base = buildRuleContext(sceneWith(children), measurer(boxes), extras)
  const ctx = {
    ...base,
    thresholds: mergedThresholds(rule, DEFAULT_GUARD_CONFIG),
  }
  return {
    ctx,
    lint: () => rule.lint(ctx) as GuardFinding[],
    fix: (f) => rule.autofix!(f, ctx),
  }
}

/** Extract the px move each setLayout call encodes (root parent = 1080). */
function moves(calls: CommandCall[]): Record<string, { dx: number; dy: number }> {
  const out: Record<string, { dx: number; dy: number }> = {}
  for (const c of calls) {
    const args = c.args as { id: string; layout: { dx?: number; dy?: number } }
    out[args.id] = {
      dx: (args.layout.dx ?? 0) * 1080,
      dy: (args.layout.dy ?? 0) * 1080,
    }
  }
  return out
}

describe("spacing-rhythm", () => {
  const column = [text("a"), text("b"), text("c"), text("d")]

  it("flags a column with uneven gaps and equalizes to the 8px grid", () => {
    const { lint, fix } = ctxFor("spacing-rhythm", column, {
      a: { x: 100, y: 100, w: 400, h: 80 }, // gap a→b: 24
      b: { x: 100, y: 204, w: 400, h: 80 }, // gap b→c: 40
      c: { x: 100, y: 324, w: 400, h: 80 }, // gap c→d: 24
      d: { x: 100, y: 428, w: 400, h: 80 },
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe("spacing-rhythm")
    expect(findings[0].ids).toEqual(["a", "b", "c", "d"])
    expect(findings[0].message).toContain("uneven vertical gaps")

    // median(24,40,24)=24 → grid target 24; a pinned, chain restacks.
    // (emitTranslations quantizes normalized offsets to 3 decimals — moves
    // land within ±0.54px on a root-parented node, hence precision 0.)
    const m = moves(fix(findings))
    expect(m.a).toBeUndefined()
    expect(m.b).toBeUndefined() // 100+80+24 = 204 already in rhythm
    expect(m.c.dy).toBeCloseTo(-16, 0) // → 308
    expect(m.d.dy).toBeCloseTo(-16, 0) // → 412
  })

  it("tolerates small wiggle (spread ≤ 6px)", () => {
    const { lint } = ctxFor("spacing-rhythm", column, {
      a: { x: 100, y: 100, w: 400, h: 80 }, // 24
      b: { x: 100, y: 204, w: 400, h: 80 }, // 28
      c: { x: 100, y: 312, w: 400, h: 80 }, // 26
      d: { x: 100, y: 418, w: 400, h: 80 },
    })
    expect(lint()).toHaveLength(0)
  })

  it("treats large spread as intentional asymmetry (> 32px)", () => {
    const { lint } = ctxFor("spacing-rhythm", column, {
      a: { x: 100, y: 100, w: 400, h: 80 }, // 16
      b: { x: 100, y: 196, w: 400, h: 80 }, // 160 — hero break
      c: { x: 100, y: 436, w: 400, h: 80 }, // 16
      d: { x: 100, y: 532, w: 400, h: 80 },
    })
    expect(lint()).toHaveLength(0)
  })

  it("skips chains shorter than minChain and lanes that don't overlap", () => {
    const { lint } = ctxFor("spacing-rhythm", column, {
      a: { x: 100, y: 100, w: 400, h: 80 },
      b: { x: 100, y: 204, w: 400, h: 80 },
      // c/d live in a separate right-hand lane (no x-overlap with a/b)
      c: { x: 620, y: 100, w: 300, h: 80 },
      d: { x: 620, y: 240, w: 300, h: 80 },
    })
    expect(lint()).toHaveLength(0)
  })

  it("refuses the fix when restacking would collide with an outsider", () => {
    const blocker = text("blocker")
    const { lint, fix } = ctxFor(
      "spacing-rhythm",
      [...column, blocker],
      {
        a: { x: 100, y: 100, w: 400, h: 80 }, // 24
        b: { x: 100, y: 204, w: 400, h: 80 }, // 48
        c: { x: 100, y: 332, w: 400, h: 80 }, // 24
        d: { x: 100, y: 436, w: 400, h: 80 },
        // Out of the column's lane (12% x-overlap) but squatting where c
        // must land (y→308) — the fix must refuse the whole chain.
        blocker: { x: 450, y: 300, w: 400, h: 30 },
      }
    )
    const findings = lint().filter((f) => f.rule === "spacing-rhythm")
    expect(findings).toHaveLength(1)
    expect(findings[0].ids).toEqual(["a", "b", "c", "d"]) // lane excludes blocker
    expect(fix(findings)).toHaveLength(0)
  })
})

describe("alignment", () => {
  it("flags a 6px near-miss against a sibling edge and snaps it", () => {
    const { lint, fix } = ctxFor("alignment", [text("a"), text("b")], {
      a: { x: 100, y: 100, w: 400, h: 80 },
      b: { x: 106, y: 300, w: 400, h: 80 }, // left edges 6px apart
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    // First-seen node moves, the other anchors (document order).
    expect(findings[0].ids).toEqual(["a", "b"])
    expect(findings[0].message).toContain("6px horizontally")
    const m = moves(fix(findings))
    expect(m.a.dx).toBeCloseTo(6, 0)
    expect(m.b).toBeUndefined()
  })

  it("ignores sub-perceptual (1px) and compositional (15px) offsets", () => {
    const { lint } = ctxFor("alignment", [text("a"), text("b"), text("c")], {
      a: { x: 100, y: 100, w: 400, h: 80 },
      b: { x: 101, y: 300, w: 400, h: 80 }, // 1px — leave it
      c: { x: 115, y: 500, w: 400, h: 80 }, // 15px — composition
    })
    expect(lint()).toHaveLength(0)
  })

  it("snaps to the canvas centerline", () => {
    const { lint, fix } = ctxFor("alignment", [text("a")], {
      a: { x: 346, y: 100, w: 400, h: 80 }, // centerX 546, canvas 540 → 6px
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain("canvas center")
    const m = moves(fix(findings))
    expect(m.a.dx).toBeCloseTo(-6, 0)
  })

  it("does not align a left edge to a sibling's RIGHT edge (adjacency)", () => {
    const { lint } = ctxFor("alignment", [text("a"), text("b")], {
      a: { x: 100, y: 100, w: 200, h: 80 }, // right edge at 300
      b: { x: 306, y: 100, w: 200, h: 80 }, // left edge 6px past it
    })
    // same-kind lines only: left(306) vs left(100) = 206, right vs right =
    // 206, centers 206 — nothing in [2,10].
    expect(lint()).toHaveLength(0)
  })

  it("mutual near-miss converges: one node anchors, the other moves", () => {
    const { lint, fix } = ctxFor("alignment", [text("a"), text("b")], {
      a: { x: 100, y: 100, w: 400, h: 80 },
      b: { x: 108, y: 300, w: 400, h: 80 },
    })
    const findings = lint()
    expect(findings).toHaveLength(1) // NOT two symmetric findings
    const m = moves(fix(findings))
    const moved = Object.keys(m)
    expect(moved).toHaveLength(1)
  })
})

describe("edge-margin", () => {
  it("flags text inside the ig-post safe inset (72px) and clamps it in", () => {
    const { lint, fix } = ctxFor("edge-margin", [text("a")], {
      a: { x: 20, y: 400, w: 400, h: 80 }, // 20px from the left edge
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain("20px from the left edge")
    expect(findings[0].message).toContain("72px")
    const m = moves(fix(findings))
    expect(m.a.dx).toBeCloseTo(52, 0) // 20 → 72
  })

  it("leaves full-bleed spans alone", () => {
    const { lint } = ctxFor("edge-margin", [text("banner")], {
      banner: { x: 10, y: 400, w: 1060, h: 80 }, // spans 98% of the width
    })
    expect(lint()).toHaveLength(0)
  })

  it("does not double-flag boxes outside the frame (frame-overflow owns those)", () => {
    const { lint } = ctxFor("edge-margin", [text("a")], {
      a: { x: -40, y: 400, w: 400, h: 80 },
    })
    expect(lint()).toHaveLength(0)
  })

  it("skips text inside a card that itself hugs the edge", () => {
    const card = node({
      id: "card",
      role: "badge",
      css: { background: "#111" },
      children: [text("label")],
    })
    const { lint } = ctxFor("edge-margin", [card], {
      card: { x: 8, y: 400, w: 400, h: 160 },
      label: { x: 28, y: 440, w: 200, h: 40 },
    })
    expect(lint().filter((f) => f.ids.includes("label"))).toHaveLength(0)
  })

})

describe("text-clip", () => {
  it("tier 1: flags text escaping an overflow-hidden ancestor", () => {
    const frame = node({
      id: "mask",
      role: "group",
      css: { overflow: "hidden" },
      children: [text("caption")],
    })
    const { lint } = ctxFor("text-clip", [frame], {
      mask: { x: 100, y: 100, w: 400, h: 100 },
      caption: { x: 120, y: 120, w: 360, h: 120 }, // 40px past mask's bottom
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(findings[0].ids).toEqual(["caption", "mask"])
    expect(findings[0].message).toContain("clipped 40px")
    expect(findings[0].data).toBeUndefined() // design decision — no autofix
  })

  it("tier 1: no finding without overflow clipping on the ancestor", () => {
    const frame = node({
      id: "wrap",
      role: "group",
      children: [text("caption")],
    })
    const { lint } = ctxFor("text-clip", [frame], {
      wrap: { x: 100, y: 100, w: 400, h: 100 },
      caption: { x: 120, y: 120, w: 360, h: 120 },
    })
    expect(lint()).toHaveLength(0)
  })

  it("tier 2: flags a fixed-height leaf whose scrollH exceeds clientH and releases the height", () => {
    const clipped = text("blurb", {
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0.1,
        dy: 0.1,
        width: 0.4,
        height: 0.1, // fixed → eligible for the auto-release
      },
    })
    const { lint, fix } = ctxFor("text-clip", [clipped], {
      blurb: { x: 108, y: 108, w: 432, h: 108 },
    }, {
      probeScroll: (id) =>
        id === "blurb"
          ? { scrollW: 432, scrollH: 160, clientW: 432, clientH: 108 }
          : null,
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain("needs 160px")
    const calls = fix(findings)
    expect(calls).toHaveLength(1)
    const args = calls[0].args as { id: string; layout: { height: unknown } }
    expect(args.id).toBe("blurb")
    expect(args.layout.height).toBe("auto")
  })

  it("tier 2: css-pinned heights are flagged but never auto-released", () => {
    const clipped = text("blurb", {
      css: { height: "108px" },
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0.1,
        dy: 0.1,
        width: 0.4,
        height: "auto",
      },
    })
    const { lint, fix } = ctxFor("text-clip", [clipped], {
      blurb: { x: 108, y: 108, w: 432, h: 108 },
    }, {
      probeScroll: () => ({ scrollW: 432, scrollH: 160, clientW: 432, clientH: 108 }),
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(fix(findings)).toHaveLength(0)
  })

  it("tier 2: silent without probeScroll (headless degrade)", () => {
    const clipped = text("blurb", {
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0.1,
        dy: 0.1,
        width: 0.4,
        height: 0.1,
      },
    })
    const { lint } = ctxFor("text-clip", [clipped], {
      blurb: { x: 108, y: 108, w: 432, h: 108 },
    })
    expect(lint()).toHaveLength(0)
  })
})

describe("edge-margin (pinch)", () => {
  it("pinched from both sides: flagged but not auto-fixed", () => {
    const { lint, fix } = ctxFor("edge-margin", [text("wide")], {
      // 30px from left AND right (1080 - 30*2 = 1020 wide), but under the
      // 90% full-bleed cut-off? 1020/1080 = 94% — spansX, so NOT flagged.
      // Use a narrower canvas-relative case: 60px margins, width 960 (89%).
      wide: { x: 60, y: 400, w: 960, h: 80 },
    })
    const findings = lint()
    expect(findings).toHaveLength(1)
    expect(fix(findings)).toHaveLength(0) // no data → no clamp
  })
})
