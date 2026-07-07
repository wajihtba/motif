// The agent-loop guard pass: lint every enabled rule over the settled,
// measured scene, apply deterministic fixes where math can settle the issue,
// re-lint, and return what's left as agent-facing warning lines. Structural
// deps (same shape as runContrastFixSession) keep it headless-testable.
//
// Bounds, in order of defense:
//   - MAX_GUARD_FIX_PASSES caps the fix→measure→re-lint convergence loop
//     (fixes reflow text, so one honest re-measure round-trip per pass);
//   - fixAttempted (`rule:ids`, once per send) stops churn on a fix that
//     didn't stick — it must ride the warnings to the model instead;
//   - contrastFixAttempted keeps the pre-guard once-per-node contract for
//     color fixes (loop.ts has carried it since the contrast milestone).
// Callers must settle first (fonts ready + backend idle) — boxes and
// computed styles have to be fresh.

import type { GuardConfig, GuardFinding, ScrollProbe } from "./types"
import type {
  FixSessionBackend,
  FixSessionCtrl,
} from "../contrast-check"
import { contrastText } from "../contrast-lint"
import { contrastRule, toContrastFinding } from "./rules/contrast"
import {
  buildRuleContext,
  guardAutofix,
  guardText,
  isRuleEnabled,
  mergedThresholds,
  runSyncRules,
} from "./registry"

export const MAX_GUARD_FIX_PASSES = 3

export interface GuardPassDeps {
  ctrl: FixSessionCtrl
  backend: FixSessionBackend & { probeScroll?: ScrollProbe }
  config: GuardConfig
  /** Once-per-send churn guard for deterministic layout fixes, keyed
   *  `${rule}:${ids.join("+")}` — owned by AgentSession. */
  fixAttempted: Set<string>
  /** Once-per-send guard for automatic contrast fixes, keyed by node id
   *  (pre-guard key, unchanged). */
  contrastFixAttempted: Set<string>
  /** Called after every applied auto-fix — AgentSession bumps lastSeenSeq so
   *  the fix doesn't surface as a phantom "user edit". */
  onFixed?: () => void
}

export interface GuardPassResult {
  /** Capped `layout:` + `contrast:` warning lines for the tool result. */
  lines: string[]
  /** Unresolved findings (sync rules + contrast), post-fix. */
  findings: GuardFinding[]
}

const fixKey = (f: GuardFinding) => `${f.rule}:${f.ids.join("+")}`

export async function runGuardPass(
  deps: GuardPassDeps
): Promise<GuardPassResult> {
  const { ctrl, backend, config } = deps
  const measure = (id: string) => backend.measure(id)
  const buildCtx = () =>
    buildRuleContext(ctrl.store.state.document.scene, measure, {
      probeStyle: backend.probeStyle
        ? (id) => backend.probeStyle!(id)
        : undefined,
      probeScroll: backend.probeScroll,
      revision: ctrl.history.lastSeq,
    })

  let ctx = buildCtx()
  let findings = runSyncRules(ctx, config)

  // Deterministic layout pass — bounded convergence, then hand the rest over.
  if (config.agentAutofix) {
    for (let pass = 0; pass < MAX_GUARD_FIX_PASSES && findings.length; pass++) {
      const actionable = findings.filter((f) => !deps.fixAttempted.has(fixKey(f)))
      if (!actionable.length) break
      const calls = guardAutofix(actionable, ctx, config)
      if (!calls.length) break
      const res = ctrl.dispatch(calls, {
        source: "agent",
        label: "Design auto-fix",
      })
      if (!res.ok) break
      for (const f of actionable) deps.fixAttempted.add(fixKey(f))
      deps.onFixed?.()
      await backend.whenIdle()
      ctx = buildCtx()
      findings = runSyncRules(ctx, config)
    }
  }

  const lines = guardText(findings)

  // Contrast (async tier) — deterministic "safe" repair first, once per node
  // per send; the model only hears about what math can't settle.
  if (backend.probeStyle && isRuleEnabled(contrastRule, config)) {
    const contrastCtx = () => ({
      ...ctx,
      thresholds: mergedThresholds(contrastRule, config),
    })
    let cFindings = await contrastRule.lint(contrastCtx())
    const fixable = cFindings.filter(
      (f) => !deps.contrastFixAttempted.has(f.ids[0])
    )
    if (fixable.length) {
      const calls = contrastRule.autofix!(fixable, contrastCtx())
      if (calls.length) {
        const res = ctrl.dispatch(calls, {
          source: "agent",
          label: "Contrast auto-fix",
        })
        if (res.ok) {
          for (const f of fixable) deps.contrastFixAttempted.add(f.ids[0])
          deps.onFixed?.()
          await backend.whenIdle()
          ctx = buildCtx()
          cFindings = await contrastRule.lint(contrastCtx())
        }
      }
    }
    lines.push(...contrastText(cFindings.map(toContrastFinding)))
    findings = [...findings, ...cFindings]
  }

  return { lines, findings }
}
