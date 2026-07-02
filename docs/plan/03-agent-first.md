# 03 — Agent-First Design

This is the heart of the remake. v1 built the seam (headless `dispatch`/`describe`) but never
connected a model. The remake makes the agent loop the product, and every decision below optimizes
for "an agent does X and it works out of the box".

The governing philosophy (carried from v1): **code where code is the medium, declarative
everywhere else.** The agent writes raw HTML/CSS for content/style and raw GLSL for custom
shaders; structure, layout, targeting, animation tracks, and tokens are declarative data the UI
mirrors and the normalize gate repairs. Code escape-hatches everywhere, so the registry is never a
ceiling.

## 1. Tool surface: 4 tools — not 35, not 1

| Tool | Purpose |
|---|---|
| `motif_generate` | Emit a full or partial `Scene` (declarative tree). Eager input streaming on; the canvas assembles progressively. Used for brief→scene and big restructures. |
| `motif_edit` | `{ commands: Command[] }` — a **typed batch** of granular commands (`element.setStyle`, `element.create`, `fx.add`, `anim.add`, `theme.setToken`, `variant.override`, `brief.update`, …) as a discriminated union in the schema. One call = one transaction = one undo entry. |
| `motif_read` | World model on demand: `{ level: 'summary' \| 'tree' \| 'node' \| 'capabilities', id? }`. |
| `motif_export` | Trigger image/video export (video gated behind a user confirm in the UI). |

Why this shape:

- **Transactionality falls out of the batch.** The model naturally groups related edits; we get
  atomic apply/rollback and a single diff response per call.
- **Real JSON schemas per command variant** give API-side validation that a schema-in-description
  string never can, while keeping the tool list tiny and **byte-stable for prompt caching**.
- 35 separate tools would bloat every request, invite serial single-command calls, and make
  transactional grouping impossible. One untyped `dispatch(id, args)` tool throws away input
  validation and measurably degrades call accuracy.
- **One source of truth:** command schemas are generated from the same command-registry
  definitions the normalize gate and the UI use (v1's best idea, kept and extended).
- The **effect/anim capability catalog** (param names, min/max/step/default, blurbs) is *not* in
  tool schemas — it changes with the registry, not the API contract. It lives in the cached system
  prompt and behind `motif_read { level: 'capabilities' }`.

## 2. World model & diff-based responses

- `describe()` v2 emits a **compact, stable** line format per node:
  `headline (h1) role=headline box=[64,540 952×120] "SPRING SALE" css:{font…} anim:[fadeUp@0.2s] fx:[]`
  — ids stable, ordering stable, floats rounded. Cache- and diff-friendly, ~10× smaller than raw
  JSON.
- **After every `motif_edit`/`motif_generate`, the tool result is a diff, not the world:**
  `applied: 6 · changed: headline.css.fontSize 64→88, badge.layout.anchor tr→br · new boxes: … ·
  warnings: [clamped fx.intensity 4.2→1.0] · user-edits-since-last-turn: […]`. Full state only via
  `motif_read`. This cuts loop tokens ~5–10× and — critically — surfaces the human's concurrent
  edits so the agent never fights the user.
- Levels: `summary` (counts, format, theme, brief — auto-injected each turn), `tree` (compact
  lines), `node` (full css/html of one node), `capabilities` (effect/anim catalog + command list).

## 3. Command-batch transactionality

`dispatch(batch)`: validate all → normalize all → apply inside one `produceWithPatches`. On any
hard failure nothing commits, and the tool result reports *which* command failed and why
(`is_error` for unrecoverable; structured `warnings` for repairs). Policy: repairable issues never
abort (normalize fixes them); unresolvable ids / unknown commands abort the whole batch —
atomicity is worth more to the model than partial progress, because the diff tells it exactly what
to resend.

## 4. Normalize gate v2

Layered: **zod parse** (coerce types) → **clamp** (registry param ranges) → **resolve** (role→ids;
fuzzy id match with edit-distance ≤2; default target = current selection, else last-created) →
**sanitize** → **repair report** (returned in the tool result).

Sanitization is new and load-bearing, because agent output hits the live DOM:

- **HTML**: allowlist sanitizer — text/inline/semantic tags plus `img` with `asset:` URLs only;
  strip `script`/`iframe`/`on*`; `style` attributes rewritten into the node's `css` map.
- **CSS**: values pass through (the escape hatch stays open) but deny `position:fixed`, `url()`
  with non-asset/non-data schemes, and `@import`.
- **GLSL**: agent `frag` bodies are wrapped in the fixed prelude (controlled uniform/API surface,
  no samplers beyond ours) and **compiled against a sandbox program before commit**; a compile
  failure returns the shader info log in the tool result so the agent fixes it in the same turn.
  Loop guards: iteration caps in the prelude + a GPU watchdog (frame time >50ms twice → the layer
  auto-disables and reports to chat).

## 5. Semantic targeting & shared attention

- Keep and extend v1's `role` enum (`headline/subhead/cta/badge/price/eyebrow/image/…`). The gate
  resolves `{ type:'role', role }` targets; agent instructions prefer roles over raw ids.
- `element.select` mirrors the agent's focus into the UI — a selection halo animates on elements
  the agent is working on during its turn. Cheap, and it makes the agent's actions legible.
- Symmetrically, the user's current selection is default target context for the agent's next edit.

## 6. Multi-turn memory of design intent

- **Durable intent lives in `document.brief`** (goal, audience, tone, must-include, notes) —
  agent-writable via `brief.update`, shown and editable in the UI, included in every turn's
  context block. It survives conversation compaction, reloads, and "start a new chat".
- Conversation history persists per document; long sessions use SDK-side compaction. Brand kit +
  brief immunize against summarization losing the essentials.
- Per-turn context block (after the cache breakpoint): scene summary + current selection +
  "user edits since your last turn" diff.

## 7. Evals & testing strategy for the agent loop

Four lanes, cheapest first:

1. **Unit (CI, no model):** normalize-gate table tests (malformed/loose inputs → expected
   repairs); command golden tests (batch → scene JSON snapshot); partial-JSON parser fuzz
   (truncate valid tool inputs at every byte).
2. **Simulated agent (CI, no model):** recorded real tool-call transcripts replayed against
   dispatch — the regression net for the seam.
3. **Live-model smoke (nightly):** 10 canonical briefs through the real loop, asserting
   programmatic invariants — required roles present, no node box overflows the canvas, text
   contrast over its sampled background ≥3:1, export completes, agent GLSL compiles, ≤N loop
   iterations. These checks double as a future auto-critique tool for the agent itself.
4. **LLM-judge aesthetics (manual trigger):** exported PNGs scored against a rubric (hierarchy,
   brand adherence, balance) — trend tracking, not gating.

Pixel-regression comparisons run in a local/manual lane only: CI Chrome needs the experimental
flag, so render-exact tests are pinned to a known-good local Chrome (and later, the headless
server-export path makes them CI-able).
