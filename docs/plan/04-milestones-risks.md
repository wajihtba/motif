# 04 — Milestones & Risks

Ordered riskiest-first; each milestone ends with a demoable verify script, and nothing builds on
unverified foundations.

## Milestones

### M0 — Engine core paints a scene (highest risk first)
Port scene types/layout/theme from v1; measurement host; flat paint-unit compiler; compositor
draws a hardcoded 3-unit scene (with nested CSS inside units) at 1080×1080; correct DPR;
demand-driven loop idling at 0%; unsupported-browser gate; platform-conformance self-test.
**Verify:** static render pixel-matches the DOM measurement host; one unit given a hardcoded
transform moves independently at 60fps.

### M1 — Document + controller + normalize + undo
Immer store; dispatch with transactions/patches; ~25 core commands; normalize gate v2 including
sanitizers; incremental DOM patching; history; selection/drag/resize interaction; minimal
properties panel.
**Verify:** scripted command batches mutate the canvas incrementally (DOM ops counted — no
rebuilds); undo/redo across 50 mixed steps is byte-stable; normalize table tests green.

### M2 — Chat agent E2E (the product exists here)
Server route streaming the Anthropic API (claude-opus-4-8, adaptive thinking, prompt caching); the
4 tools; client turn driver; chat UI from the shadcn primitives; `motif_generate` with streamed
partial apply; diff tool results; `document.brief`.
**Verify:** "make me an IG post for a spring sale" → watchable progressive generation → "make the
headline bolder and add a price badge" lands as one undoable step; warm-cache turn cost logged and
sane.

### M3 — Effects (GPU-resident)
Port the v1 registry and all five kinds; WebGL2 pipeline with ping-pong FBOs; pixel ops as
shaders; per-unit effect chains including in-frame backdrop sampling; custom-GLSL escape hatch
with the compile gate; effects panel auto-generated from defs.
**Verify:** the v1 shader catalog renders at element and scene scope; zero `getImageData` in the
frame path (asserted); agent-authored broken GLSL round-trips to a fix in one turn.

### M4 — Animation + timeline
Seconds-based animator tracks; presets (text reveal per word/line, kinetic badge, ambient float,
pulse, slide/fade); per-unit transform/opacity in the compositor (v1's dead feature comes alive);
timeline scrubber + play; animation panel; stagger.
**Verify:** two simultaneously animated units + one animated scene shader at 60fps/1080² (budget
test); scrubbing is deterministic (same t → same pixels).

### M5 — Video export
Deterministic frame-step pipeline; WebCodecs + mp4-muxer (WebM fallback); progress/cancel UI;
export at exact format pixels (DPR=1).
**Verify:** 10s@30fps 1080² mp4 in ≤15s wall clock; plays in QuickTime/Chrome/IG upload preview;
frame 150 of two exports is pixel-identical.

### M6 — Brand kit, templates, multi-format
Asset store (IndexedDB blobs); brand kit UI + system-prompt injection; looks catalog; template
starters; `FormatVariant` + `variant.override` + format switcher; "generate all formats" agent
flow; batch static export.
**Verify:** one brief → 4 formats sharing content; a headline edit propagates to all; brand
palette/logo applied without being asked.

### M7 — Polish, persistence hardening, evals
Autosave/load/project list; `.motif` import/export; inline text-edit overlay; chat-transcript
persistence + compaction; keyboard shortcuts; empty/error states; eval lanes 1–3 in CI; budget
dashboards.
**Verify:** killing the tab mid-edit → reload restores document + chat; full eval suite green;
every budget in [02-performance.md](02-performance.md) met.

Post-M7 (designed-in, not scheduled): headless-Chrome server export path; DOM-preview fallback
backend; server sync behind the persistence interface.

## Risks & mitigations

| Risk | Likelihood / Impact | Mitigation |
|---|---|---|
| HTML-in-Canvas API changes or never ships (Chrome-flag-only today) | Med / Fatal-if-unhedged | It *is* the product bet — accepted. `RendererBackend` isolation; startup conformance self-test; measurement host stays authoritative for layout so a DOM-preview fallback is bounded work; headless-server export path for users without the flag; pinned known-good Chrome in docs/CI. |
| Paint-record semantics differ across Chrome versions (promotion, refresh timing) | Med / High | All lifecycle assumptions live in `loop.ts` + `paint-units.ts` only; the self-test surfaces regressions instead of silently corrupting frames. |
| Unit extraction breaks flow layout (extracted child leaves a hole) | Med / Med | Measured-size hidden placeholders; golden layout tests comparing measurement host vs composed output. |
| H.264 encode unavailable (some Linux/Chromium builds) | Med / Med | `isConfigSupported` probe → VP9/WebM is a first-class fallback, not an afterthought; UI states the container. |
| Agent-authored HTML/CSS/GLSL as injection/DoS surface | High / Med | Normalize-gate sanitizers; GLSL compile gate + prelude iteration caps + GPU watchdog; `asset:`-only URL scheme; no eval, no external fetches from scene content. |
| Loop cost/latency erodes the fast-iteration feel | Med / Med | Prompt-cache discipline (stable tools/system, volatile tail); diff-based tool results; streamed partial apply for perceived speed; effort dropped to medium on trivial turns. |
| Multi-format overrides drift into N forked scenes | Med / Med | Overrides are layout/visibility-only **by type**; content keys are structurally impossible; normalize rejects violations. |
| Undo/DOM desync (two representations: scene JSON + live DOM) | Med / High | DOM written only by `dom-patch.ts` from store patches (single writer); debug mode diffs DOM against a fresh mount in eval lane 2. |
| Scope creep toward a general design tool | High / Med | The guardrails in [00-product.md](00-product.md) §3; every feature request triaged against them. |
