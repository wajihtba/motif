// Design guard — the modular rule registry's contract (docs/plan/06-design-guard.md).
// A DesignRule packages one quality check: a lint over the measured scene and,
// when math can settle it, a deterministic autofix. Rules share ONE world
// model per pass (RuleContext.entries — collectEntries run once), are
// individually toggleable via GuardConfig, and keep the lint philosophy:
// warnings never block, per-node opt-outs (allowOverlap/allowLowContrast)
// are respected, fixes translate — never resize or restructure.

import type { Box } from "../../engine/backend"
import type { Scene } from "../../scene/types"
import type { CommandCall } from "../dispatch"
import type { LintEntry } from "../lint"
import type { StyleProbe } from "../contrast-lint"

export const RULE_IDS = [
  // migrated (controller/lint.ts + contrast-*)
  "overlap",
  "frame-overflow",
  "container-overflow",
  "low-contrast",
  // guard-native
  "spacing-rhythm",
  "alignment",
  "edge-margin",
  "text-clip",
] as const

export type RuleId = (typeof RULE_IDS)[number]

/** Superset of LintFinding: `rule` routes autofix and config, `kind` keeps
 *  the legacy union values for migrated rules (LintOverlay tint compat),
 *  `data` is a rule-private payload its own autofix consumes. */
export interface GuardFinding {
  rule: RuleId
  kind: string
  ids: string[]
  /** One compact line, ready for the agent diff / UI chip. */
  message: string
  data?: unknown
}

export type ScrollProbe = (id: string) => {
  scrollW: number
  scrollH: number
  clientW: number
  clientH: number
} | null

/** Built once per pass — every rule reads the same measured world model. */
export interface RuleContext {
  scene: Scene
  measure: (id: string) => Box | null
  /** collectEntries(scene, measure) — shared, never rebuilt per rule. */
  entries: LintEntry[]
  /** This rule's defaults ⊕ user threshold overrides (per-rule view). */
  thresholds: Record<string, number>
  /** Per-format safe inset (px) from src/content/formats.ts. */
  formatSafe: number
  /** Live-backend extras — absent headless; rules must degrade silently. */
  probeStyle?: StyleProbe
  probeScroll?: ScrollProbe
  /** History seq for memoized async checks (contrast). */
  revision?: number
}

export interface DesignRule {
  id: RuleId
  title: string
  /** One line — settings-panel copy AND vision-judge criteria source. */
  description: string
  /** sync rules run in the debounced overlay and the agent pass; async
   *  (contrast) resolves after settle and is consumed separately. */
  tier: "sync" | "async"
  defaultEnabled: boolean
  defaultThresholds: Record<string, number>
  lint: (ctx: RuleContext) => GuardFinding[] | Promise<GuardFinding[]>
  /** Deterministic fix for THIS rule's findings only. Absent → findings ride
   *  to the model. Placements must be validated with boxesCollide so a fix
   *  never trades one warning for another (autofix.ts contract). The three
   *  core layout rules are fixed together by guardAutofix instead (one
   *  FixContext, cumulative deltas). */
  autofix?: (findings: GuardFinding[], ctx: RuleContext) => CommandCall[]
}

// --- config -----------------------------------------------------------------

export interface GuardRuleConfig {
  enabled?: boolean
  thresholds?: Record<string, number>
}

/** App-level guard configuration (persisted in localStorage — see
 *  src/persistence/settings.ts). Sparse: an absent rule entry means the
 *  registry defaults, so new rules light up without a migration. */
export interface GuardConfig {
  version: 1
  rules: Partial<Record<RuleId, GuardRuleConfig>>
  /** Deterministic layout autofix inside the agent loop (contrast "safe"
   *  fixes are governed by the low-contrast rule toggle, as today). */
  agentAutofix: boolean
  visionJudge: {
    enabled: boolean
    extraCriteria?: string[]
  }
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  version: 1,
  rules: {},
  // Off until the agent-loop convergence pass lands (phase 2 of the guard
  // rollout) — keeps the registry refactor behavior-neutral.
  agentAutofix: false,
  visionJudge: { enabled: false },
}
