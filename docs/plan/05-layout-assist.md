# 05 — Layout assist: shipped core + deferred milestone

## Shipped (this milestone)

The overlap problem — the agent generating scenes where text collides with
other content because it never saw the measured render — is closed by a
measure-based **layout lint** with a same-turn feedback loop:

- `src/controller/lint.ts` — `lintLayout(scene, measure)` runs geometric
  checks over measured boxes: content-on-content overlap (dual-axis depth +
  area thresholds; a stricter 4px rule for text-vs-text), text overflowing
  the canvas frame, and text spilling out of its own card. Text over
  images/scrims/vignettes/grain is never flagged; `allowOverlap: true` on a
  node opts its subtree out (the flexibility escape hatch).
- `src/agent/loop.ts` — after `motif_generate` / layout-affecting
  `motif_edit` transactions settle (`backend.whenIdle()` + a fonts.ready
  race), `layout:` warning lines ride the tool_result of the call that caused
  them, so the model fixes collisions before ending its turn. Injectable
  `deps.lint` keeps the loop headless-testable.
- Prevention: `CORE_SYSTEM_PROMPT` teaches the stack-first idiom (content
  chains as ONE column stack; absolute reserved for backgrounds/decor/
  floaters) and the fix-or-mark-allowOverlap contract.
- Repair: `layout.stackify` command wraps overlapping absolute siblings into
  a flex stack, ordered by current position.
- Editor: `LintOverlay` (CanvasStage) shows amber dashed outlines + badges on
  offenders — advisory, never blocks dragging; palette actions "Tidy spacing"
  and "Toggle allow overlap".

## Shipped (second pass — the formerly-deferred milestone)

1. **Auto-repair round** (`src/agent/loop.ts` `maybeRequestRepair`): when a
   turn changed the scene and the model ends it with unresolved `layout:`
   findings, ONE synthetic user message asks it to fix or mark
   `allowOverlap`, then the round loop continues. Once per send — a model
   that insists twice keeps its layout.
2. **Arrange commands** (`src/controller/commands/layout.ts`):
   `layout.align` (left/center-x/right/top/center-y/bottom of the combined
   bounds) and `layout.distribute` (even spacing; optional fixed gap) —
   agent-callable, palette-reachable, implemented as pure dx/dy translation
   so anchors/sizes/stack configs survive. Geometry is estimated from
   normalized layouts (auto sizes read as 0) — the lint re-checks the result.
3. **Drag snapping + smart guides** (`src/engine/snap.ts` pure math;
   `interaction.ts` drag integration; `GuideOverlay` in CanvasStage): the
   moving selection's union box snaps its edges/centers to sibling boxes and
   the canvas frame/center within a 6-screen-px radius; red guide segments
   render while locked; Alt bypasses.
4. **Export self-review** (`motif_export {review: true}`): the rendered
   image returns to the model as an image tool_result block for visual
   verification — opt-in, prompt tells the model to use it sparingly.

## Superseded (see 06-design-guard.md)

The lint/auto-fix core described above now lives behind the **design-guard
rule registry** (`src/controller/guard/`): per-rule enable/thresholds,
deterministic layout auto-fix wired INTO the agent loop (not just the
editor toggle), four new rules (edge-margin, text-clip, spacing-rhythm,
alignment), and an opt-in vision-review round. `lintLayout`/`autofixLayout`
remain as the shared primitives the registry composes.

## Still deferred

- **Snap hysteresis / spacing-equalization guides** (Figma's "equal gap"
  pips) — plain radius snapping first; add stickiness tuning only if drags
  feel wrong in practice.
- **Resize snapping** — drag-only for now.
- **Automated LLM-judge scoring** of exported renders in the eval harness
  (scripts/eval-live.ts) — the in-session review round (06) gives the model
  eyes; a scored judge belongs with the eval lane.
