// The design-guard registry — the ordered rule catalogue plus the shared
// runners. One buildRuleContext per pass (collectEntries runs once, every
// rule reads the same measured world model), per-rule threshold merging,
// and guardAutofix routing each rule's findings to its OWN fixer — except
// the three core layout rules, whose findings share one autofixLayout
// FixContext so cumulative deltas see each other.
//
// Registry order IS autofix order: bounds-restoring rules first (a box pulled
// inside the frame changes what spacing/alignment see), rhythm rules next,
// collision rules last (they re-judge whatever the earlier fixes moved).

import type { CommandCall } from "../dispatch"
import type { Box } from "../../engine/backend"
import type { Scene } from "../../scene/types"
import type {
  DesignRule,
  GuardConfig,
  GuardFinding,
  RuleContext,
  RuleId,
  ScrollProbe,
} from "./types"
import type { StyleProbe } from "../contrast-lint"
import type { LintFinding } from "../lint"
import { collectEntries, lintText } from "../lint"
import { autofixLayout } from "../autofix"
import { formatByKey } from "../../content/formats"
import {
  CORE_LAYOUT_RULE_IDS,
  containerOverflowRule,
  frameOverflowRule,
  overlapRule,
} from "./rules/core"
import { contrastRule } from "./rules/contrast"
import { edgeMarginRule } from "./rules/edge-margin"
import { textClipRule } from "./rules/text-clip"
import { spacingRhythmRule } from "./rules/spacing-rhythm"
import { alignmentRule } from "./rules/alignment"

export const DESIGN_RULES: DesignRule[] = [
  edgeMarginRule,
  textClipRule,
  spacingRhythmRule,
  alignmentRule,
  overlapRule,
  frameOverflowRule,
  containerOverflowRule,
  contrastRule,
]

export function ruleById(id: RuleId): DesignRule | undefined {
  return DESIGN_RULES.find((r) => r.id === id)
}

export function isRuleEnabled(rule: DesignRule, config: GuardConfig): boolean {
  return config.rules[rule.id]?.enabled ?? rule.defaultEnabled
}

export function enabledRules(
  config: GuardConfig,
  tier?: DesignRule["tier"]
): DesignRule[] {
  return DESIGN_RULES.filter(
    (r) => (!tier || r.tier === tier) && isRuleEnabled(r, config)
  )
}

/** Registry defaults ⊕ user overrides — the per-rule thresholds view. */
export function mergedThresholds(
  rule: DesignRule,
  config: GuardConfig
): Record<string, number> {
  return { ...rule.defaultThresholds, ...config.rules[rule.id]?.thresholds }
}

export interface RuleContextExtras {
  probeStyle?: StyleProbe
  probeScroll?: ScrollProbe
  revision?: number
}

/** One shared context per pass. `thresholds` is seeded empty — the runners
 *  swap in each rule's merged view before calling it. */
export function buildRuleContext(
  scene: Scene,
  measure: (id: string) => Box | null,
  extras: RuleContextExtras = {}
): RuleContext {
  return {
    scene,
    measure,
    entries: collectEntries(scene, measure),
    thresholds: {},
    formatSafe: formatByKey(scene.format).safe,
    ...extras,
  }
}

/** Run every enabled sync rule over one context. */
export function runSyncRules(
  ctx: RuleContext,
  config: GuardConfig
): GuardFinding[] {
  const findings: GuardFinding[] = []
  for (const rule of enabledRules(config, "sync")) {
    const out = rule.lint({ ...ctx, thresholds: mergedThresholds(rule, config) })
    // sync tier: lint() must not return a promise.
    if (Array.isArray(out)) findings.push(...out)
  }
  return findings
}

/** Deterministic fixes for a set of findings, routed per rule in REGISTRY
 *  order. Core layout findings (overlap/frame/container) merge into ONE
 *  autofixLayout call at the core rules' position (last — they re-judge
 *  whatever earlier fixes proposed). Rules without an autofix contribute
 *  nothing — their findings ride to the model.
 *
 *  One node, one move per pass: every emitted setLayout compounds dx/dy
 *  against the SAME pre-pass layout snapshot, so a second call for a node
 *  would clobber the first, not stack on it. Later rules' calls for an
 *  already-claimed node are dropped; the next lint pass re-judges from
 *  fresh measurements. */
export function guardAutofix(
  findings: GuardFinding[],
  ctx: RuleContext,
  config: GuardConfig
): CommandCall[] {
  const calls: CommandCall[] = []
  const claimed = new Set<string>()
  const push = (ruleCalls: CommandCall[]) => {
    for (const call of ruleCalls) {
      const id = call.args?.id
      if (typeof id === "string") {
        if (claimed.has(id)) continue
        claimed.add(id)
      }
      calls.push(call)
    }
  }

  let coreDone = false
  for (const rule of DESIGN_RULES) {
    if (CORE_LAYOUT_RULE_IDS.has(rule.id)) {
      if (coreDone) continue
      coreDone = true
      const core = findings.filter((f) => CORE_LAYOUT_RULE_IDS.has(f.rule))
      if (core.length) {
        push(
          autofixLayout(
            ctx.scene,
            ctx.measure,
            core.map(
              (f): LintFinding => ({
                kind: f.kind as LintFinding["kind"],
                ids: f.ids,
                message: f.message,
              })
            )
          )
        )
      }
      continue
    }
    if (!rule.autofix || !isRuleEnabled(rule, config)) continue
    const own = findings.filter((f) => f.rule === rule.id)
    if (!own.length) continue
    push(
      rule.autofix(own, {
        ...ctx,
        thresholds: mergedThresholds(rule, config),
      })
    )
  }
  return calls
}

/** Findings → capped agent-facing `layout:` lines (contrast findings have
 *  their own `contrast:` channel via contrastText — same as pre-guard). */
export function guardText(findings: GuardFinding[], max = 6): string[] {
  return lintText(
    findings.map((f) => ({
      kind: f.kind as LintFinding["kind"],
      ids: f.ids,
      message: f.message,
    })),
    max
  )
}
