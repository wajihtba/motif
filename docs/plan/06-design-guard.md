# 06 — Design guard: the modular quality control loop

The control loop for AI-generated scenes: every enabled rule lints the
MEASURED render, deterministic fixes apply where math can settle the issue,
and only what's left rides back to the model — one text repair round, then
(optionally) one vision-review round. Warnings never block; per-node
opt-outs (`allowOverlap`, `allowLowContrast`) and per-rule toggles keep
intentional design reachable.

## Pipeline (per send)

```
tool call applies → settle (fonts ready + backend idle)
  → runGuardPass (controller/guard/run.ts)
      lint: every enabled SYNC rule over ONE shared world model
            (collectEntries once — controller/guard/registry.ts)
      fix:  guardAutofix, bounded (MAX_GUARD_FIX_PASSES = 3), once per
            finding per send (`rule:ids` churn guard), re-lint per pass
      contrast (async tier): memoized two-tier WCAG check + "safe"
            autofix, once per node per send (pre-guard contract, unchanged)
  → remaining findings ride the tool_result as layout:/contrast: lines
model ends turn cleanly
  → maybeRequestRepair (agent/loop.ts): one synthetic repair message
  → maybeRequestReview: one vision round (render + critique brief),
    config-gated, off by default (agent/judge.ts)
```

## The registry (controller/guard/)

`DesignRule` = `{ id, title, description, tier, defaultEnabled,
defaultThresholds, lint(ctx), autofix?(findings, ctx) }`. Rules share a
`RuleContext` built once per pass: scene, measure, entries, per-rule merged
thresholds, `formatSafe` (content/formats.ts), optional `probeStyle`/
`probeScroll`/`revision` (live backend only — rules degrade silently
headless).

Registry order IS autofix order (bounds → clip → rhythm → alignment →
collisions last). guardAutofix routes findings to their own rule's fixer,
merges the three core layout rules into ONE autofixLayout FixContext, and
enforces one-move-per-node per pass (claims).

Rules:

| id | fix | notes |
| -- | --- | ----- |
| edge-margin | clamp inward | text-only, format safe inset, full-bleed + edge-hugging-card exemptions |
| text-clip | release layout-pinned height → auto | ancestor overflow-clips and css-pinned heights ride to the model |
| spacing-rhythm | equalize lane gaps to the 8px grid (median) | lane-based chains; whole chain refused if any restack collides |
| alignment | snap same-kind lines (2–10px window) | anchor/nudge bookkeeping prevents mutual-swap oscillation |
| overlap / frame-overflow / container-overflow | autofixLayout free-space search | migrated from controller/lint.ts, shared FixContext |
| low-contrast | autofixContrast "safe" ladder | async tier; memoization in contrast-check.ts untouched |

Every translation goes through `emitTranslations` (controller/autofix.ts):
dx/dy only — anchors, sizes, stack configs survive; placements are
pre-validated with `boxesCollide`, the exact rule the lint would re-flag
with (a fix can never trade one warning for another).

## Config

`GuardConfig` (controller/guard/types.ts), persisted in localStorage
(`motif:design-guard`, persistence/settings.ts) — sparse per-rule
`{enabled, thresholds}` over registry defaults, `agentAutofix` (on),
`visionJudge` (off). Surfaced in the TopBar "Guard" popover
(DesignGuardMenu.tsx); consumed live by the agent loop, the canvas overlay
and the editor auto-fix toggle via `useGuardConfig`.

## Vision review (off by default)

`agent/judge.ts` — in-band: the settled render (downscaled JPEG, the
`motif_export {review:true}` shape) plus a critique brief covering the
SUBJECTIVE complement of the deterministic rules (hierarchy, balance,
crowding, type scale, color, polish + `extraCriteria`). The model either
edits (re-entering the lint pipeline) or declares the design passing; one
round per send (`judgeAttempted`), bounded by `MAX_ROUNDS` like everything
else. A stricter out-of-band judge (own route/system prompt/JSON verdict)
plugs in behind `buildJudgeMessage` later.

## Testing

Headless throughout: `tests/guard-rules.test.ts` (per-rule goldens, Map
measure stubs), `tests/guard-registry.test.ts` (filtering, threshold merge,
adapter parity with the legacy lintLayout, routing), `tests/guard-run.test.ts`
(convergence, churn guard, config gates, over a real controller + simulated
measure), `tests/agent-loop.test.ts` (loop wiring + review round via
injectable `guardConfig`/`reviewImage`), `tests/settings.test.ts` (config
persistence).
