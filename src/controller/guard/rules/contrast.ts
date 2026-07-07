// The migrated contrast rule — async adapter over the memoized two-tier
// check (controller/contrast-check.ts). Findings wrap the full
// ContrastFinding in `data` so the autofix adapter can hand the original
// shape to autofixContrast; the memoization in contrast-check.ts is
// untouched (keyed by revision + scene identity).

import type { DesignRule, GuardFinding, RuleContext } from "../types"
import type { ContrastFinding } from "../../contrast-lint"
import { lintContrastAfterSettle } from "../../contrast-check"
import { autofixContrast } from "../../contrast-autofix"
import { cssColorToRgba } from "../../../lib/css-color"

export function toContrastFinding(f: GuardFinding): ContrastFinding {
  return f.data as ContrastFinding
}

export const contrastRule: DesignRule = {
  id: "low-contrast",
  title: "Contrast",
  description:
    "text failing WCAG AA contrast against what actually renders behind it",
  tier: "async",
  defaultEnabled: true,
  defaultThresholds: {},
  async lint(ctx: RuleContext): Promise<GuardFinding[]> {
    // Needs the live style probe and a revision key — headless contexts
    // without them skip, same as the pre-guard `if (backend.probeStyle)` gate.
    if (!ctx.probeStyle || ctx.revision == null) return []
    const findings = await lintContrastAfterSettle({
      scene: ctx.scene,
      measure: ctx.measure,
      probe: ctx.probeStyle,
      revision: ctx.revision,
    })
    return findings.map((f) => ({
      rule: "low-contrast",
      kind: f.kind,
      ids: f.ids,
      message: f.message,
      data: f,
    }))
  },
  autofix(findings, ctx) {
    return autofixContrast(
      ctx.scene,
      ctx.measure,
      findings.map(toContrastFinding),
      cssColorToRgba,
      "safe"
    )
  },
}
