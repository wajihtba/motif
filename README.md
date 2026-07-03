# Motif

**Motif** is an agent-first editor for social-media marketing visuals: post images and short
animated campaign videos. You chat with Claude; Claude builds the design — as real, editable
HTML/CSS painted into a `<canvas>` via Chrome's experimental
[HTML-in-Canvas API](https://html-in-canvas.dev/) (`ctx.drawElementImage`) — and every element
stays editable afterwards: drag, restyle, re-prompt, animate, export.

This repo is the **v2 remake** (TanStack Start + React 19 + Tailwind v4 + shadcn/ui) of the
SvelteKit proof of concept, built to the decision record in [`docs/plan/`](docs/plan/). All
eight milestones (M0–M7) are implemented and browser-verified.

## What's here

- **Chat agent** — 4 tools (`motif_generate/edit/read/export`), tool schemas generated from
  the command registry's zod schemas, progressive scene apply while the stream is still open
  (one undo step per turn), diff-based tool results including "user edits since your last
  turn". Server route is the only file touching the Anthropic SDK; without an
  `ANTHROPIC_API_KEY` it serves a recorded mock stream so the full product works keyless.
- **Engine** — flat paint-unit renderer over `drawElementImage`: hidden measurement host does
  layout, units composite with per-unit transform/opacity, GPU-resident effect chain (WebGL2,
  in-frame backdrop sampling, zero `getImageData` in the frame path), ~10-case conformance
  self-test at startup, GPU watchdog.
- **Editing** — select/drag/resize/nudge, inline text editing (double-click), inspector
  (Design | Effects | Animate), 72-effect catalog + custom-GLSL escape hatch that
  sandbox-compiles before commit, seconds-based deterministic animator with timeline
  scrubbing, ⌘K palette, ⌘/ shortcut help. Everything — UI, agent, palette — dispatches
  through one command seam with transactional undo.
- **Output** — PNG/JPEG export at exact format pixels, deterministic WebCodecs video export
  (H.264 mp4, WebM fallback), one-click batch export of all 7 platform formats derived from
  one canonical scene via layout-only variant overrides, brand kit compiled into theme tokens
  and injected into every agent turn, 14 curated looks.
- **Persistence** — IndexedDB project store with 500ms-debounced autosave, chat transcript
  persistence with replay-safe compaction, `.motif` project files (zip: document + chat +
  referenced assets), project home with live thumbnails.

## Platform requirement

Motif paints everything into a `<canvas>` — no DOM fallback in the editor. It requires the
experimental flag:

- **Chrome / Canary** → `chrome://flags/#canvas-draw-element` → Enabled → relaunch
- **Brave** → `brave://flags/#canvas-draw-element` → Enabled → relaunch

Without it you'll see an "Enable HTML-in-Canvas" gate. (Headless verification runs with
`--enable-experimental-web-platform-features`.)

## Develop

```bash
bun install
bun run dev        # vite dev on :3000
bun run build
bun run test       # vitest (eval lanes 1–2: unit + simulated agent)
bun run typecheck
bun run lint
bun run check      # prettier --check
```

The live agent needs an Anthropic API key on the server side (`ANTHROPIC_API_KEY` in `.env`,
see `.env.example` — never shipped to the client). Keyless, the chat runs against the
recorded mock stream.

Dev harnesses: `/dev/engine` (pixel parity + unit transforms), `/dev/effects` (full catalog
sweep), `/dev/anim` (animation perf + export bench). In the editor, the ⌘K palette can toggle
a live fps/paint-unit budget overlay.

## Evals

- **Lanes 1–2 (CI)** — `bun run test`: normalize-gate tables, command goldens, partial-JSON
  fuzz, recorded agent-transcript replay. Runs in `.github/workflows/ci.yml`.
- **Lane 3 (live model, manual/nightly)** — `bun scripts/eval-live.ts` drives 10 canonical
  briefs through the real loop in flagged headless Chrome, asserting roles present, text in
  bounds, headline contrast, export completion, round caps, and zero console errors.
- **Lane 4 (LLM-judge aesthetics)** — manual, not yet scripted.
