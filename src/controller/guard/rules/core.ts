// The migrated layout rules — thin adapters over the extracted checks in
// controller/lint.ts, so `lintLayout` call sites and tests keep byte-identical
// behavior while the guard registry gains per-rule toggles.
//
// None of these carry their own `autofix`: their findings are fixed TOGETHER
// by guardAutofix through one autofixLayout FixContext, because an overlap
// fix must see the cumulative deltas of an overflow fix in the same pass
// (the exact contract autofix.ts already implements).

import type { DesignRule, GuardFinding, RuleContext } from "../types"
import {
  checkContainerOverflow,
  checkFrameOverflow,
  checkOverlap,
} from "../../lint"
import type { LintFinding } from "../../lint"

const tag = (rule: GuardFinding["rule"]) => (f: LintFinding): GuardFinding => ({
  rule,
  kind: f.kind,
  ids: f.ids,
  message: f.message,
})

export const overlapRule: DesignRule = {
  id: "overlap",
  title: "Overlap",
  description:
    "content colliding with other content (text through cards, badges over headlines)",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: { minDepthPx: 8, minAreaFrac: 0.04, textDepthPx: 4 },
  lint(ctx: RuleContext): GuardFinding[] {
    return checkOverlap(ctx.entries, {
      minDepthPx: ctx.thresholds.minDepthPx,
      minAreaFrac: ctx.thresholds.minAreaFrac,
      textDepthPx: ctx.thresholds.textDepthPx,
    }).map(tag("overlap"))
  },
}

export const frameOverflowRule: DesignRule = {
  id: "frame-overflow",
  title: "Canvas overflow",
  description: "text sticking out past the canvas edge (cropped on export)",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {},
  lint(ctx: RuleContext): GuardFinding[] {
    return checkFrameOverflow(ctx.entries, ctx.scene).map(
      tag("frame-overflow")
    )
  },
}

export const containerOverflowRule: DesignRule = {
  id: "container-overflow",
  title: "Card overflow",
  description: "text spilling outside the card it visually belongs to",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {},
  lint(ctx: RuleContext): GuardFinding[] {
    return checkContainerOverflow(ctx.entries).map(tag("container-overflow"))
  },
}

/** The rules whose findings feed one shared autofixLayout FixContext. */
export const CORE_LAYOUT_RULE_IDS = new Set<GuardFinding["rule"]>([
  "overlap",
  "frame-overflow",
  "container-overflow",
])
