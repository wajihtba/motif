# Motif

**Motif** is an agent-first editor for social-media marketing visuals: post images and short
animated campaign videos. You chat with Claude; Claude builds the design — as real, editable
HTML/CSS painted into a `<canvas>` via Chrome's experimental
[HTML-in-Canvas API](https://html-in-canvas.dev/) (`ctx.drawElementImage`) — and every element
stays editable afterwards: drag, restyle, re-prompt, animate, export.

This repo is the **v2 remake** (TanStack Start + React 19 + Tailwind v4 + shadcn/ui) of the
SvelteKit proof of concept. It is currently at the planning stage — the full decision record
lives in [`docs/plan/`](docs/plan/):

| Doc | Contents |
|---|---|
| [00-product.md](docs/plan/00-product.md) | Target user, core flows, scope guardrails, what "agent-first" means concretely |
| [01-architecture.md](docs/plan/01-architecture.md) | Rendering-engine decision, module layout, document model v2, flat paint-unit renderer, agent loop, undo, persistence |
| [02-performance.md](docs/plan/02-performance.md) | Budgets, GPU-resident effect chain, deterministic WebCodecs video export, DPR rules |
| [03-agent-first.md](docs/plan/03-agent-first.md) | The 4-tool surface, diff-based world model, normalize gate v2, sanitization, evals |
| [04-milestones-risks.md](docs/plan/04-milestones-risks.md) | Build order M0–M7 with verify criteria, risk table |

## Platform requirement

Motif paints everything into a `<canvas>` — no DOM fallback in the editor. It requires the
experimental flag:

- **Chrome / Canary** → `chrome://flags/#canvas-draw-element` → Enabled → relaunch
- **Brave** → `brave://flags/#canvas-draw-element` → Enabled → relaunch

Without it you'll see an "Enable HTML-in-Canvas" gate.

## Develop

```bash
bun install
bun run dev        # vite dev on :3000
bun run build
bun run test       # vitest
bun run typecheck
bun run lint
bun run check      # prettier --check
```

The agent loop needs an Anthropic API key on the server side (`ANTHROPIC_API_KEY` in `.env` —
never shipped to the client).
