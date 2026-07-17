# 07 — Backend + MCP/CLI: agent access to Motif

This plan is written to be executed by an agent WITHOUT prior context. Every
interface named here was verified against the code on 2026-07-07 (branch
`master`, HEAD `9dcdd58`). File paths are relative to the repo root.

## Context

Motif is a browser-only AI canvas design app (TanStack Start + React 19 +
Vite 8, **bun** as package manager/runtime, TypeScript, vitest). Rendering
depends on Chrome's experimental HTML-in-Canvas API (`ctx.drawElementImage`,
behind `--enable-experimental-web-platform-features`). Goal: make the app's
logic — especially the **Design Guard** and the **agentic generation loop** —
accessible headlessly to agents via **MCP (first), CLI (alongside), HTTP API
(optional last)**, moving logic to a backend where that improves
reliability/consistency/performance/robustness, while the browser app stays
fully self-sufficient (no behavior change for users).

**Decisions already made:**

- MCP stdio server first + CLI; HTTP API optional last phase.
- Local-first: backend runs on the agent's machine; projects are `.motif`
  files on disk; MCP spawns local headless Chrome.
- Same package, new entry points (`src/server/`, `src/mcp/`, `src/cli/`) —
  NO monorepo split.
- Shared logic stays a **single isomorphic copy** per module — heads differ
  only in injected dependencies. Never fork a module.

## Phase overview

| Phase | Deliverable | Chrome needed | Gate |
|---|---|---|---|
| 0 | Purity hardening (5 DOM-leak fixes, `request.ts`, eslint boundary, node purity test) | none | existing suite + purity test green, browser smoke unchanged |
| 1 | FileStore (.motif on disk) + MotifService + data-only CLI | none | file-store round-trip test, CLI create→edit→read→reopen smoke |
| 2 | Measure-tier headless renderer + `motif guard` | stock Chromium | browser-vs-headless guard finding-set diff |
| 3 | Server-side agent runs (`motif generate`) | stock Chromium | keyless mock run E2E; keyed: 10 eval-live briefs pass |
| 4 | Export tier (PNG/JPEG/video, vision review) | flagged Chrome | golden export hash matches browser export |
| 5 | MCP stdio server (`motif mcp`) | inherits 2/4 | mcp-smoke test + live Claude Code round |
| 6 (opt) | HTTP head (`motif serve`) | inherits | curl smoke |

**Ordering:** 0 → 2 → 3 → 4 is strict; 1 can proceed in parallel with 2;
5 needs 1+2 and gains tools as 3/4 land; 6 anytime after 1.

## Ground truth — verified facts the design rests on

1. **`EditorController` (`src/controller/index.ts:19`) is already headless.**
   "Imports no React and no UI." API: `dispatch(calls, opts) → DispatchResult`,
   `undo()/redo()`, `describe(opts)`, `load(document)`,
   `attachBackend(backend)/detachBackend()`, `backendRef`, `store`
   (DocumentStore), `history` (has `lastSeq`, `since(seq)`). `attachBackend`
   makes dispatch push transactions to the backend via
   `applyTransaction(scene, patches)` or `setScene(scene)` (index.ts:119-127).
   The Dispatcher's measure callback (index.ts:31) tolerates a null backend.
2. **`RendererBackend` (`src/engine/backend.ts:95-131`) is the designed
   seam** — its header comment says a headless backend "implements the same
   contract". The guard consumes ONLY this subset: `measure(id): Box|null`
   (sync), `probeStyle?(id): ProbedStyle|null`, `probeScroll?(id):
   {scrollW,scrollH,clientW,clientH}|null`, `whenIdle(): Promise<void>`.
   `probeStyle`/`probeScroll` are optional; rules degrade silently when
   absent (`src/controller/guard/types.ts:59-63`).
3. **`AgentSession` (`src/agent/loop.ts:62`) takes every browser dependency
   via `AgentSessionDeps` (loop.ts:44-60):** `{ ctrl, chat, transport,
   deliverFile?, lint?, guardConfig?, reviewImage? }`.
   `AgentTransport = (body: {messages: ApiMessage[], effort?}, signal) =>
   Promise<AsyncIterable<SseEvent>>` where `SseEvent = {event: string, data:
   Record<string, unknown>}`. `tests/agent-loop.test.ts` already drives the
   full loop with a scripted transport — the model for the server driver.
4. **The LLM call is already server-side.** `src/routes/api.agent.ts` is the
   ONLY file importing `@anthropic-ai/sdk`. It calls `client.messages.create({
   model: "claude-opus-4-8", max_tokens: 64000, stream: true, thinking:
   {type:"adaptive"}, output_config: {effort}, system: [CORE_SYSTEM_PROMPT +
   cache_control ephemeral], tools: agentTools(), messages:
   withTailBreakpoint(body.messages) })` and re-emits each stream event as SSE
   `event: <event.type>\ndata: <JSON of the whole event>`. Keyless fallback
   replays `mockEvents(followUp)` from `src/agent/mock-stream.ts`.
5. **The experimental flag is needed only for PAINTING and export.**
   Measurement is pure DOM layout: `MeasurementHost`
   (`src/engine/html-canvas/measure.ts`) renders the full nested scene tree in
   a hidden div (`buildNodeEl` from `src/engine/html-canvas/build.ts` +
   `themeVars` from `src/scene/theme.ts` + `scene.stylesheet`), then
   `measureAll()` reads `getBoundingClientRect()` per node. API:
   `setScene(scene)`, `measureAll(): Map<id,Box>`, `boxOf(id)`, `elOf(id)`,
   `pendingImages()`, `applySceneStyle(scene)`, `attach(parent)`, `dispose()`.
   **This works in stock headless Chromium — no flag.**
6. **Guard rule dependency tiers** (rules in `src/controller/guard/rules/`,
   registry `src/controller/guard/registry.ts`, orchestration `runGuardPass`
   in `src/controller/guard/run.ts:58`):
   - Boxes only (`measure`): overlap, frame-overflow, container-overflow,
     spacing-rhythm, alignment, edge-margin, text-clip tier 1.
   - DOM probes (still stock Chromium): text-clip tier 2 (`probeScroll` →
     scrollHeight vs clientHeight), contrast tier 1 (`probeStyle` →
     getComputedStyle).
   - **Flagged Chrome only:** contrast tier 2 — samples REAL composited
     pixels via `ExportSession` (`src/engine/export/sample-contrast.ts`,
     imported by `src/controller/contrast-check.ts:11`).
   - `GuardPassDeps` (run.ts:34-47): `{ ctrl, backend, config, fixAttempted:
     Set<string>, contrastFixAttempted: Set<string>, onFixed? }` →
     `GuardPassResult = { lines: string[], findings: GuardFinding[] }`.
     Autofix loop is bounded (`MAX_GUARD_FIX_PASSES = 3`) and rebuilds
     context after each `ctrl.dispatch` + `backend.whenIdle()`.
   - `GuardConfig` (`src/controller/guard/types.ts:95-105`): `{ version: 1,
     rules: Partial<Record<RuleId, {enabled?, thresholds?}>>, agentAutofix:
     boolean, visionJudge: {enabled, extraCriteria?} }`;
     `DEFAULT_GUARD_CONFIG` exported same file.
7. **DOM leaks in the otherwise-pure set — the complete list** (verified by
   grep; Phase 0 fixes exactly these):
   - `src/scene/validate.ts:56` — `new DOMParser()`.
   - `src/controller/contrast-check.ts:11` — static import of
     `../engine/export/sample-contrast` (drags `ExportSession`/html-canvas
     into the controller graph); `:109` — bare `document.fonts.ready`.
   - `src/agent/loop.ts:20` — static `import { exportImage } from
     "../engine/export"`; `:407-410` — `document.fonts.ready` race;
     `:680-709` — `reviewJpeg`/`blobToBase64` use `createImageBitmap`,
     `document.createElement("canvas")`, `btoa`.
   - `src/persistence/motif-file.ts` — pure fflate zip codec welded to
     IndexedDB (`ProjectRecord`, `getAssetBlob`) and `File`/`Blob`.
8. **Persistence today:** IndexedDB db `"motif"` v3 (`src/persistence/db.ts`)
   with stores assets/projects/brands. `src/persistence/projects.ts` exports
   `ProjectRecord {id, name, document, chat, ...}`, `newProjectRecord`,
   `migrateDocument(doc): void` (pure — reuse it server-side), and IDB-bound
   `listProjects/getProject/putProject/deleteProject/loadOrCreateProject`.
   Assets are Blobs referenced as `asset:<id>`; the engine resolves them via
   `setAssetResolver` in `src/engine/html-canvas/build.ts` (module-level
   injectable — copy this pattern for other injections).
9. **Existing headless harnesses** (the pattern for driving flagged Chrome):
   `scripts/eval-live.ts` (Chrome launch args around line 258:
   `--enable-experimental-web-platform-features --use-gl=angle
   --enable-unsafe-swiftshader`, env `CHROME_PATH`), `scripts/verify-guard.ts`,
   `scripts/verify-contrast.ts` — all puppeteer-core against a dev server via
   `window.__motif = { ctrl, backend, chat, session }` (DEV-only,
   `src/components/editor/EditorShell.tsx:47-54`).
10. **Repo hygiene:** `bun run test|typecheck|lint`; lint baseline is dirty
    (7 files fail on master — diff against baseline, don't fix unrelated);
    tests run under jsdom; `puppeteer-core` is already a devDependency.

## Architecture

```
                 ┌─ src/mcp/server.ts     (stdio MCP — Phase 5)
 MotifService ◄──┼─ src/cli/index.ts      (bun bin "motif" — Phase 1+)
 src/server/     └─ src/server/http.ts    (optional HTTP head — Phase 6)
     │
     ├─ ProjectSession = EditorController + ChatStore + AgentSession   (existing classes, unchanged)
     ├─ FileStore (.motif on disk, ~/.motif/projects)                  replaces IndexedDB behind motif-codec
     └─ Renderer pool (puppeteer-core)
          ├─ measure tier: STOCK headless Chromium → measure/probeStyle/probeScroll/whenIdle
          │                (full guard except contrast tier 2)
          └─ export tier:  FLAGGED Chrome (CHROME_PATH) → exportImage/exportVideo,
                           vision-review JPEGs, contrast tier-2 pixel sampling
```

## What lives where

| Module | Where | Mechanism |
|---|---|---|
| `src/scene/*`, `src/controller/*` (commands, dispatch, store, history, describe, guard) | isomorphic | pure after Phase 0; guard consumes only the RendererBackend probe subset |
| `src/agent/{loop,tools,prompts,judge,chat,partial-json,mock-stream}.ts` + new `request.ts` | isomorphic | same `AgentSession` class; deps injected per host |
| new `src/agent/loop-browser-deps.ts` | frontend-only | browser defaults (reviewImage, exportImage, deliverFile) extracted from loop.ts |
| `src/brand/*`, `src/content/{formats,looks,starter}.ts` | isomorphic | already pure |
| new `src/persistence/motif-codec.ts` | isomorphic | fflate-only; browser `motif-file.ts` and server `file-store.ts` are thin adapters |
| `src/engine/backend.ts` (types), new `src/engine/probe.ts` | isomorphic types / browser-context-shared | probe.ts runs in the app AND the harness page — same bytes |
| `src/engine/{html-canvas,export,gl}/*`, `conformance.ts` | browser-context only — used by BOTH the app and the server's harness *page* | the harness bundles the identical modules; the Node process never reimplements rendering |
| `src/components`, `src/hooks`, `src/routes` (UI), `src/persistence/{db,projects,assets,autosave,settings}.ts`, `src/content/gallery*` | frontend-only | |
| `src/server/*`, `src/mcp/*`, `src/cli/*` | backend-only | may import core freely |
| `src/routes/api.agent.ts` | web app's server route | refactored onto shared `src/agent/request.ts` |

**New dependencies:** `@modelcontextprotocol/sdk` (Phase 5), `linkedom`
(Phase 0, server DOMParser), `@puppeteer/browsers` (Phase 2, pinned Chromium
install), `vite-plugin-singlefile` (Phase 2, harness bundle — or inline
assets manually). All installed with `bun add` / `bun add -d`.

---

## Phase 0 — Purity hardening (no behavior change)

### 0.1 `src/scene/validate.ts` — injectable DOM parser

Replace the direct `new DOMParser()` at line 56 with the
module-level-injectable pattern proven in
`src/engine/html-canvas/build.ts:13-17` (`setAssetResolver`):

```ts
type DomParseFn = (html: string) => Document
let parseDom: DomParseFn = (html) =>
  new DOMParser().parseFromString(html, "text/html")
export function setDomParser(fn: DomParseFn): void { parseDom = fn }
```

Browser/jsdom keep working with zero changes. The server bootstrap (Phase 1)
calls `setDomParser` with `linkedom`'s DOMParser. Watch the return-type usage
— inspect what validate.ts does with the parsed doc and confirm linkedom
supports it (querySelectorAll, attributes, textContent are supported; if
something is missing, adapt the sanitizer to the common subset).

### 0.2 `src/controller/contrast-check.ts` — injectable pixel sampler + fonts guard

- Remove the static `import { sampleContrast } from
  "../engine/export/sample-contrast"` (line 11). Add a module-level
  injectable:

```ts
export type PixelSampler = typeof import("../engine/export/sample-contrast").sampleContrast
let pixelSampler: PixelSampler | null = null
export function setContrastSampler(fn: PixelSampler): void { pixelSampler = fn }
```

  When `pixelSampler` is null, tier-2 (deferred pixel checks) is skipped —
  tier-1 style findings still emit. Inspect the tier-2 call site and make the
  skip graceful (deferred checks resolve as "unsampled", not errors).
- Guard the `document.fonts.ready` at line 109: `typeof document ===
  "undefined" ? Promise.resolve() : Promise.race([document.fonts.ready,
  timeout])`.
- Install the browser default where the app boots the editor —
  `src/components/editor/EditorShell.tsx` (import `sampleContrast`, call
  `setContrastSampler(sampleContrast)` once). Check
  `src/components/editor/CanvasStage.tsx` too — whichever module currently
  reaches contrast-check first.

### 0.3 `src/agent/loop.ts` — extract browser defaults

- Create `src/agent/loop-browser-deps.ts` (frontend-only), moving from
  loop.ts: `reviewJpeg`, `blobToBase64`, and a factory
  `browserReviewImage(ctrl: EditorController): () => Promise<string>` that
  wraps the current `defaultReviewImage` body (`exportImage(scene, "jpeg")` +
  `reviewJpeg`). Also export `browserDeliverFile` if `deliverFile`'s current
  default lives in loop.ts (check — it may already be passed by EditorShell).
- Add `exportImage?: (scene: Scene, type: "png"|"jpeg", t?: number) =>
  Promise<Blob>` to `AgentSessionDeps` and route the `motif_export` tool
  branch in `runTool` (loop.ts ~535) through it. Browser default = the
  engine's `exportImage`, passed by EditorShell via loop-browser-deps; when
  absent, the tool returns a typed "export unavailable" tool_result instead
  of throwing. (The server leaves it undefined until Phase 4.)
- In loop.ts: delete `import { exportImage } from "../engine/export"`
  (line 20) and the moved functions; in `maybeRequestReview` (line 371)
  change `this.deps.reviewImage ?? (() => this.defaultReviewImage())` to
  require the dep — if `reviewImage` is absent, return false (review round
  silently unavailable). Guard the fonts race in `lintAfterSettle`
  (lines 407-410) with `typeof document !== "undefined"`.
- Keep `getGuardConfig` as the fallback (its localStorage read is try/caught
  — verify in `src/persistence/settings.ts:51`; if it throws without
  `localStorage`, fall back to `DEFAULT_GUARD_CONFIG` when
  `typeof localStorage === "undefined"`). The server always injects
  `guardConfig` anyway.
- Update `src/components/editor/EditorShell.tsx` to pass `reviewImage:
  browserReviewImage(ctrl)`, `exportImage`, (and deliverFile if applicable)
  when constructing `AgentSession`. **Vision review and motif_export must
  behave exactly as before in the browser** — verify with the existing tests
  and a manual run.

### 0.4 `src/persistence/motif-codec.ts` — pure zip codec

Split the fflate logic out of `src/persistence/motif-file.ts`:

```ts
export interface MotifArchive {
  meta: Record<string, unknown>      // whatever meta.json holds today
  document: Document
  chat: StoredChat | null
  assets: Map<string, Uint8Array>    // asset id → raw bytes
}
export function encodeMotif(a: MotifArchive): Uint8Array
export function decodeMotif(bytes: Uint8Array): MotifArchive
export function assetIdsIn(document: Document): string[]   // move from motif-file.ts
```

`motif-file.ts` keeps its public API (`exportMotifFile(record):
Promise<Blob>`, `importMotifFile(file): Promise<ProjectRecord>`) as a thin
adapter: IDB blobs ↔ Uint8Array, Blob/File ↔ bytes. Preserve the zip entry
layout exactly (`meta.json`, `document.json`, `chat.json`, `assets/<id>`) —
existing `.motif` files must round-trip.

### 0.5 `src/agent/request.ts` — shared LLM request assembly

Extract from `src/routes/api.agent.ts` into isomorphic `src/agent/request.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk"   // type-only import, erased at runtime
export interface AgentRequestBody { messages: Anthropic.MessageParam[]; effort?: "low"|"medium"|"high" }
export function buildAgentRequest(body: AgentRequestBody): Anthropic.MessageCreateParamsStreaming
// contains: model claude-opus-4-8, max_tokens 64000, stream true, adaptive thinking,
// output_config effort, system [CORE_SYSTEM_PROMPT + cache_control ephemeral],
// tools agentTools(), messages withTailBreakpoint(body.messages)
export function withTailBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[]  // moved verbatim
```

`api.agent.ts` becomes: parse body → keyless? mockResponse :
`client.messages.create(buildAgentRequest(body))` → SSE re-emit
(sse/sseResponse/mockResponse stay in the route). One source of truth for the
model call.

### 0.6 Boundary enforcement + purity test

- `eslint.config.js`: add `no-restricted-imports` (or
  `import-x/no-restricted-paths`) rules so
  `src/{scene,controller,agent,brand,content}/**` (minus
  `agent/loop-browser-deps.ts`) cannot import from `src/components`,
  `src/hooks`, `src/routes`, `src/engine/html-canvas`, `src/engine/export`,
  `src/engine/gl`, `src/persistence/{db,projects,assets,autosave}`.
  (`src/persistence/settings.ts` stays importable by loop.ts as the guarded
  fallback; `src/engine/backend.ts` type imports are allowed.)
- `tests/node-purity.test.ts` in a **node-environment** vitest project (add a
  second project entry in `vitest.config.ts` / workspace with `environment:
  "node"` matching just this file): import every core module;
  `new EditorController()`; dispatch `scene.apply` with `starterScene()`
  (`src/content/starter.ts`); `describe({level:"tree"})`; `agentTools()`;
  `encodeMotif`/`decodeMotif` round-trip; drive `AgentSession` with the
  scripted transport copied from `tests/agent-loop.test.ts` (stub `lint:
  async () => []`, `guardConfig: () => DEFAULT_GUARD_CONFIG`). This proves
  plain-Node viability, not just jsdom.

**Phase 0 acceptance:** `bun run test` green (all ~28 existing files + purity
test); `bun run typecheck` green; `bun run lint` no NEW failures vs the
7-file baseline; manual browser smoke: generate a design, vision review still
fires when enabled, export PNG works.

---

## Phase 1 — File store + service core + data-only CLI

### 1.1 `src/server/store/file-store.ts`

```ts
export interface OpenProject { id: string; path: string; archive: MotifArchive }
export class FileStore {
  constructor(readonly dir: string)                    // default: ~/.motif/projects (mkdir -p)
  list(): Promise<Array<{id, name, path, mtime}>>      // scan dir for *.motif, read meta.json cheaply
  open(idOrPath: string): Promise<OpenProject>         // decodeMotif → migrateDocument(archive.document)
  create(opts: {name: string; format?: string}): Promise<OpenProject>  // starterScene()-based Document
  save(p: OpenProject): Promise<void>                  // encodeMotif → write tmp file → rename (atomic)
  importFile(srcPath: string): Promise<OpenProject>    // copy into workspace, mint new id
}
```

Reuse `migrateDocument` from `src/persistence/projects.ts` (it's pure — but
it lives in an IDB-importing module; move `migrateDocument` + the pure parts
of `newProjectRecord` into a new isomorphic `src/persistence/migrate.ts` and
re-export from projects.ts — this keeps the eslint boundary clean).

### 1.2 `src/server/session.ts` + `src/server/service.ts`

```ts
// session.ts
export class ProjectSession {
  readonly ctrl: EditorController      // load(archive.document)
  readonly chat: ChatStore
  project: OpenProject
  backend: RendererBackend | null      // leased in Phase 2
  agent: AgentSession | null           // created lazily in Phase 3
  dirty: boolean                       // set on ctrl.store subscription; debounced autosave
}

// service.ts — the single brain all heads (CLI/MCP/HTTP) share
export class MotifService {
  constructor(opts: {workspaceDir?: string; configPath?: string})   // config: ~/.motif/config.json
  // projects
  createProject(opts): Promise<{id}>; openProject(idOrPath): Promise<{id}>
  saveProject(id): Promise<void>; listProjects(): Promise<...>; importMotif(path): Promise<{id}>
  // document
  edit(id, calls: CommandCall[]): DispatchResult        // ctrl.dispatch(calls, {source:"agent"})
  read(id, opts: {level: "summary"|"tree"|"node"|"capabilities"; nodeId?}): string   // ctrl.describe
  undo(id) / redo(id)
  // Phase 2+: guard(id, opts) ; Phase 3+: agentRun(...) ; Phase 4+: exportImage/exportVideo
  // static catalogs
  formats() / looks() / components()   // src/content/formats.ts, looks.ts, src/brand/components/registry.ts
  capabilities(): {measureTier: boolean; exportTier: boolean; chromeVersions: ...}
  dispose(): Promise<void>
}
```

Bootstrap (`src/server/bootstrap.ts` or top of service.ts):
`setDomParser(linkedomParser)` before anything touches validate.ts.

### 1.3 `src/cli/index.ts`

`package.json`: add `"bin": {"motif": "./src/cli/index.ts"}`; file starts
`#!/usr/bin/env bun` (bun runs TS in place and resolves the `@/` tsconfig
alias — no build step). Hand-rolled arg parsing or `util.parseArgs` — no new
dep needed.

| Command | Behavior |
|---|---|
| `motif create --name X [--format ig-post] [--dir D]` | create + save, print path/id |
| `motif list [--dir D]` | table or `--json` |
| `motif edit <id\|path> [--calls-file f.json]` (or JSON batch on stdin) | dispatch batch, print DispatchResult summary |
| `motif read <id\|path> --level tree [--node <id>]` | print describe output |
| `motif undo/redo <id\|path>` | |
| `motif import <file.motif>` / `motif save <id>` | |
| `motif formats` / `motif looks` / `motif components` | catalogs, `--json` |
| (Phase 2+) `motif guard <id> [--fix] [--json]` | findings + lines |
| (Phase 3+) `motif generate <id> "<brief>" [--effort high]` | streamed progress |
| (Phase 4+) `motif export <id> --type png\|jpeg\|mp4 --out f` | |
| (Phase 5+) `motif mcp` | stdio MCP server |
| `motif doctor [--install]` | capability report; install pinned Chromium |

All commands support `--json` for machine consumption. Errors exit non-zero
with a typed `{code, message}` on stderr in `--json` mode.

**Phase 1 acceptance:** new `tests/file-store.test.ts` (round-trip vs codec; a
legacy fixture migrates); CLI smoke (can be a vitest node test spawning the
CLI): create → edit batch via stdin (e.g. `element.create` +
`element.setStyle`) → read tree shows the node → save → reopen → identical
describe output.

---

## Phase 2 — Measure-tier headless renderer + guard

### 2.1 `src/engine/probe.ts` — extract probe bodies

`probeStyle`/`probeScroll` currently live as methods on `HtmlCanvasBackend`
(`src/engine/html-canvas/index.ts:162-198`, `computedOf` at :155) reading the
measurement host's elements. Extract element-level pure functions:

```ts
export function probedStyleOf(el: Element): ProbedStyle   // getComputedStyle mapping, moved verbatim
export function probeScrollOf(el: Element): {scrollW,scrollH,clientW,clientH}
```

`HtmlCanvasBackend` delegates to them; the harness (2.2) uses them on a bare
`MeasurementHost` (no canvas pipeline). Same bytes in both contexts.

### 2.2 Harness page — `src/server/renderer/harness/entry.ts` + `vite.harness.config.ts`

The harness reuses the app's OWN modules so measured geometry is identical by
construction. It imports: `MeasurementHost`, `setAssetResolver` (build.ts),
`probedStyleOf`/`probeScrollOf`, and the app's font packages
(`@fontsource-variable/montserrat` CSS). Exposes:

```ts
window.__headless = {
  // rebuild + settle: fonts.ready + image tracker drained + double rAF
  setScene(scene: Scene): Promise<void>,
  // one round-trip snapshot of everything guard needs
  snapshot(): {
    boxes: Record<string, Box>,                 // from measureAll()
    styles: Record<string, ProbedStyle>,        // probedStyleOf per node el
    scrolls: Record<string, Scroll>,            // probeScrollOf per node el
    fontsMissing: string[],                     // document.fonts.check per family in theme/stylesheet
  },
  ping(): "ok",
}
```

Build config `vite.harness.config.ts`: entry
`src/server/renderer/harness/index.html` importing entry.ts;
`vite-plugin-singlefile` (inline JS/CSS/fonts as data URIs where possible) →
output `dist-headless/harness.html`. Add script `"build:harness": "vite build
-c vite.harness.config.ts"`. If font inlining bloats or fails, serve woff2
via the asset server (2.3) instead — correctness first:
`document.fonts.ready` must reflect the real Montserrat.
Export-tier extras (Phase 4) are added to the same entry behind a capability
check.

### 2.3 `src/server/renderer/asset-server.ts`

`Bun.serve` bound to `127.0.0.1:0` (ephemeral):

- `GET /harness.html` → `dist-headless/harness.html`
- `GET /s/<sessionId>/assets/<id>` → bytes from that session's
  `archive.assets` map (register/unregister per session; session-scoped
  routes avoid cross-session bleed)
- `GET /fonts/*` → files from
  `node_modules/@fontsource-variable/montserrat/files/` (if not inlined)

Harness boot: `setAssetResolver((url) => url.replace(/^asset:/,
"/s/<sid>/assets/"))` — the sid is passed via query param on the page URL.
Same-origin serving matches the browser's no-taint guarantee
(`src/persistence/assets.ts` rationale).

### 2.4 `src/server/renderer/measure-backend.ts` — `HeadlessMeasureBackend implements RendererBackend`

Bridges the **sync** `RendererBackend` reads to **async** CDP with a snapshot
cache:

- Constructor takes a leased puppeteer `Page` (stock headless Chromium,
  viewport fixed, `deviceScaleFactor: 1`).
- `capabilities = {liveCanvas:false, shaders:false, video:false}`; `stage`
  returns a dummy (`null as unknown as HTMLElement`; nothing in the guard
  path touches it); `mount/setSampler/setContinuous/invalidate/renderFrame`
  are no-ops.
- `setScene(scene)` and `applyTransaction(scene, _patches)` both just store
  `latestScene` and set `dirty = true` (patch granularity is unnecessary
  headless — a guard pass is "settle then measure everything").
- `whenIdle()`: if dirty → `page.evaluate(__headless.setScene, latestScene)`
  then `snapshot = await page.evaluate(__headless.snapshot)`; populate three
  local Maps; `dirty = false`.
- `measure(id)` / `probeStyle(id)` / `probeScroll(id)`: answered
  synchronously from the cached Maps. **Both probes are defined** (stock
  Chromium supports them) → text-clip tier 2 and contrast tier 1 light up
  headless.
- `dispose()`: release the page back to the pool.
- Note: the Dispatcher's sync measure callback during dispatch reads the
  pre-dispatch cache (stale by one transaction). The guard's own loop always
  calls `whenIdle()` before re-linting (run.ts awaits it after each fix
  dispatch), so guard correctness is unaffected. Document this in the class
  header.

### 2.5 `src/server/renderer/pool.ts`

- Lazily launch one Chromium via a `@puppeteer/browsers`-installed pinned
  build (fallback: `CHROMIUM_PATH` env). Keep 2 warm pages pre-navigated to
  `harness.html`.
- `lease(sessionId): Promise<Page>` / `release(page)` (navigate
  `about:blank`, return to pool). One leased page per ProjectSession for the
  session's lifetime — keeps the measurement DOM warm across guard passes.
- Recycle a page after ~200 operations or 30 min. `browser.on("disconnected")`
  → mark dead, relaunch on next lease. Per-op timeout 15s on evaluate; on
  timeout/crash: retry ONCE on a fresh page, then throw a typed
  `RendererError{code:"measure_timeout"|...}`.
- Concurrency cap (default 4 concurrent evaluates) with a FIFO queue.

### 2.6 Wire guard into the service

`MotifService.guard(id, opts: {autofix?: boolean; config?:
Partial<GuardConfig>}): Promise<GuardPassResult & {fontsMissing: string[]}>`:
lease backend if the session has none → `ctrl.attachBackend(backend)` (the
controller then feeds it transactions automatically) → `await
backend.whenIdle()` → `runGuardPass({ctrl, backend, config: merged
(DEFAULT_GUARD_CONFIG ⊕ workspace config ⊕ per-call), fixAttempted: new
Set(), contrastFixAttempted: new Set()})`. Append `font-missing:` warnings
from the snapshot. CLI: `motif guard <id> [--fix] [--json]` (`--fix` sets
`agentAutofix: true` and saves the project after).

### 2.7 Startup self-check — `src/server/renderer/self-check.ts`

On first lease (and via `motif doctor`): `setScene(starterScene())` →
snapshot → assert a known node's box within ±0.5px of a golden value recorded
from the browser (generate the golden once via the existing
`scripts/verify-guard.ts` flow and commit it as a fixture), and
`styles[headlineId].color` matches the theme token. Fail loud naming what
diverged (font? chromium version?).

**Phase 2 acceptance:**

- New `scripts/verify-headless-guard.ts`: run the same fixture documents
  through (a) the existing browser path (pattern of `scripts/verify-guard.ts`,
  flagged Chrome + dev server + `window.__motif`) and (b) `MotifService.guard`,
  then **diff the finding sets** (rule, ids). Allowed difference: contrast
  tier-2-only findings present only in (a). This is the guard-consistency
  proof.
- Existing guard test suites unchanged and green. `motif guard` works on a
  `.motif` fixture with zero Chrome flags.

---

## Phase 3 — Server-side agent runs

### 3.1 `src/server/agent-transport.ts`

```ts
export function sdkTransport(opts: {apiKey?: string}): AgentTransport {
  return async (body, signal) => {
    if (!opts.apiKey) return mockIterable(body)         // reuse mockEvents(followUp) from src/agent/mock-stream.ts,
                                                        // same followUp detection as api.agent.ts:127-131
    const client = new Anthropic({ apiKey: opts.apiKey })
    const stream = await client.messages.create(buildAgentRequest(body), { signal })
    return (async function* () {
      for await (const ev of stream) yield { event: ev.type, data: ev as unknown as Record<string, unknown> }
    })()
  }
}
```

The event shape matches what the browser's `parseSse` yields (api.agent.ts
emits `sse(event.type, event)` — data IS the whole event object), so
`consumeStream` in loop.ts works unchanged. Honor `signal` (the SDK accepts
request options with signal; if the installed version differs, abort via
`stream.controller.abort()` on signal).

### 3.2 `MotifService.agentRun`

```ts
agentRun(id, brief: string, opts: {effort?, onEvent?: (e) => void}): Promise<{status, findingsSummary}>
```

Create a per-session `AgentSession` with deps:

- `ctrl`, `chat` (subscribe to ChatStore snapshots → forward to `onEvent` for
  CLI/MCP progress),
- `transport: sdkTransport({apiKey: process.env.ANTHROPIC_API_KEY})`,
- `lint`: leave **undefined** — the default `lintAfterSettle` path works: it
  uses `ctrl.backendRef` (the leased measure backend), the fonts race is now
  guarded (0.3), and `backend.whenIdle()` + `runGuardPass` run against
  headless Chromium,
- `guardConfig: () => workspaceConfig` with `visionJudge.enabled` forced
  **false** until Phase 4 (no export tier → no review image),
- `reviewImage` / `exportImage`: undefined until Phase 4 (the motif_export
  tool then returns its typed "export unavailable" result),
- `deliverFile: (blob, filename) => write to <workspace>/exports/`
  (Blob→arrayBuffer→Bun.write).

Then `await session.send(brief)`; autosave after. CLI: `motif generate <id>
"<brief>" [--effort high]` — streams text deltas/tool progress to stderr,
final summary to stdout.

**Phase 3 acceptance:** keyless mode: `motif generate` on a fresh project
replays `mockEvents` end-to-end through the REAL service + REAL measure
backend (guard pass included) and saves a scene — CI-runnable with stock
Chromium only. With `ANTHROPIC_API_KEY`: run the ten canonical briefs from
`scripts/eval-live.ts:29-40` through the CLI and assert the same invariants
that script checks (roles present, bounds inside frame, no error status) — no
dev server, no flagged Chrome needed.

---

## Phase 4 — Export tier (flagged Chrome)

### 4.1 Harness export extras (same `entry.ts`, capability-gated)

Add to `window.__headless` when `detectCapabilities().liveCanvas`:

- `exportImageB64(scene, type: "png"|"jpeg", t?: number): Promise<string>` —
  wraps the app's `exportImage` (`src/engine/export/index.ts`); plus
  `reviewImageB64(scene)` for the judge (reuse `reviewJpeg` from
  loop-browser-deps by importing it in the harness — it's browser-context
  code, allowed there).
- `exportVideoChunked(scene, onChunk): Promise<{mime}>` — wraps
  `exportVideo`; deliver via `page.exposeFunction("__deliverChunk", ...)`
  callbacks (avoids giant evaluate payloads).
- `runConformance(): Promise<Report>` — reuse `src/engine/conformance.ts`
  verbatim.
- Enable contrast tier 2 in-page: the harness calls
  `setContrastSampler(sampleContrast)` at boot when liveCanvas — a guard pass
  whose page is a FLAGGED page then gets pixel-sampled contrast for free.
  (Optional optimization; guard fully works on the stock tier.)

### 4.2 `src/server/renderer/export-backend.ts` + pool tier

Launch flagged Chrome from `CHROME_PATH` with the args proven in
`scripts/eval-live.ts` (~line 258): `--enable-experimental-web-platform-features
--use-gl=angle --enable-unsafe-swiftshader --headless=new` etc. Pages created
on demand, disposed after export (mirrors the app's transient
`ExportSession`). Boot validation: in-page `detectCapabilities().liveCanvas
=== true` else typed error naming the flag; run `runConformance()` once per
browser launch and log the report.
Service: `exportImage(id, {type, out?, t?})` (returns bytes or writes file),
`exportVideo(id, {out})`. Wire `reviewImage` + `exportImage` deps into
`agentRun` (vision review now allowed: `visionJudge.enabled` follows
workspace config). Timeouts: image 60s, video 600s; one retry on a fresh
page.

**Phase 4 acceptance:** golden-scene PNG export hash matches a
browser-produced export of the same scene at dpr=1 (determinism contract
"same t → same pixels", `src/engine/export/index.ts`); `motif export --type
mp4` produces a playable file; `motif generate` with visionJudge on completes
a review round (visible as the judge message in the transcript).

---

## Phase 5 — MCP server

`src/mcp/server.ts` using `@modelcontextprotocol/sdk` (stdio transport),
started by `motif mcp [--dir workspace]`. One `MotifService` per process;
project handles keyed by id.

| MCP tool | Backing | Input schema source |
|---|---|---|
| `motif_project_create/open/save/list/import` | FileStore | small zod objects, `z.toJSONSchema` (same helper as `src/agent/tools.ts:39`) |
| `motif_edit` | `service.edit` | **literally the `motif_edit` schema from `agentTools()`** (`src/agent/tools.ts:67`) — one schema source, byte-stable |
| `motif_generate_scene` | `scene.apply` dispatch (raw scene JSON, no LLM) | `scene.apply` command schema |
| `motif_read` | `service.read` | levels summary/tree/node/capabilities |
| `motif_undo` / `motif_redo` | controller | |
| `motif_guard` | `service.guard` | `{projectId, autofix?, rules?}` → findings JSON + warning lines + fontsMissing |
| `motif_agent_run` | `service.agentRun` | `{projectId, brief, effort?}`; stream progress via MCP progress notifications from the `onEvent` hook |
| `motif_export_image` / `motif_export_video` | export tier | image optionally returned as MCP image content block; else file path |
| `motif_list_formats/looks/components` | catalogs | |
| `motif_capabilities` | `service.capabilities()` | reports tier availability + chrome versions |

Export-dependent tools are registered but return the typed
`capability_unavailable` error (naming the missing flag/binary) when the
export tier is absent — agents get an actionable message, not a crash.

**Phase 5 acceptance:** `tests/mcp-smoke.test.ts` (node env): spawn `bun
src/cli/index.ts mcp` as a child process, speak MCP over stdio (initialize →
tools/list → assert `motif_edit` input schema deep-equals the one from
`agentTools()`), then: create → generate_scene (apply a fixture scene) → edit
→ guard → read. Live check: register the server in Claude Code (`claude mcp
add motif -- bun <repo>/src/cli/index.ts mcp`) and drive one edit+guard
round.

---

## Phase 6 (optional) — HTTP head

`src/server/http.ts` + `motif serve [--port]`: `Bun.serve` JSON routes over
the same MotifService — `POST /v1/projects`, `POST
/v1/projects/:id/{edit,guard,export}`, `POST /v1/projects/:id/agent` as SSE
(reuse the `sse()` formatting from api.agent.ts). Localhost-only bind by
default. The web app is untouched.

---

## Reliability / consistency / performance / robustness (cross-cutting)

- **Consistency by construction:** one copy of guard/loop/commands/prompts;
  the harness page runs the app's own engine modules;
  `verify-headless-guard.ts` diffs browser vs headless findings;
  `src/agent/request.ts` keeps the web route and server transport
  byte-identical; the MCP `motif_edit` schema is the same object the LLM
  tools use.
- **Degradation ladder** (reported by `capabilities()` / `motif_capabilities`
  / `motif doctor`):
  1. Flagged Chrome (`CHROME_PATH`) → everything: full guard incl. contrast
     tier 2, export, vision review.
  2. Stock Chromium only → full guard minus contrast tier 2 (contrast tier 1
     + text-clip tier 2 DO work — they need only computed
     styles/scrollHeight); agent runs with visionJudge off; export tools →
     typed `capability_unavailable` naming the flag.
  3. No Chrome → edit/read/validate/undo/save/import all work (the controller
     is backend-optional); `motif_guard` **fails loud** with a capability
     error — every meaningful rule needs measured boxes; a silently hollow
     guard is worse than none.
- **Fonts:** the harness ships the same `@fontsource-variable/montserrat`;
  `whenSettled` awaits the REAL `document.fonts.ready` (stronger than the
  browser loop's 500ms race); per-scene `document.fonts.check()` →
  `font-missing:` warnings appended to guard output instead of silently
  measuring with fallback metrics.
- **Chrome pinning:** the measure tier installs a pinned Chromium via
  `@puppeteer/browsers` (`motif doctor --install`, version constant in
  `src/server/renderer/pool.ts`); the export tier validates `CHROME_PATH` at
  boot with an in-page `detectCapabilities()` probe; both versions logged
  into every guard/export result.
- **Isolation & perf:** interactive rendering stays client-side (unchanged
  UX; this is why the logic was frontend in the first place); one leased warm
  page per project session; concurrency cap + FIFO; page recycling (~200 ops
  / 30 min); every dispatch remains one atomic zod-validated transaction
  (Dispatcher untouched) so a crashed guard pass can never half-apply fixes.
- **Determinism:** dpr=1 exports (existing ExportSession contract), fixed
  viewport, pinned Chrome, identical fonts, guard revision keyed to
  `ctrl.history.lastSeq` (run.ts:72).

## Risks & open questions

- **linkedom sanitizer compatibility** (0.1): validate.ts's use of the parsed
  document must stay within linkedom's DOM subset. Mitigation: the node
  purity test exercises `scene.apply` with HTML-bearing nodes; if linkedom
  falls short, `happy-dom`'s parser is the fallback.
- **Harness single-file bundle size** (2.2): inlining woff2 fonts as data
  URIs may bloat harness.html or break `document.fonts.ready` semantics.
  Mitigation already planned: serve fonts via the asset server instead.
- **SDK abort-signal support** (3.1): confirm the installed
  `@anthropic-ai/sdk@0.110` streaming call accepts `{signal}` request
  options; else wire `stream.controller.abort()`.
- **`Blob` availability in bun** for `deliverFile`/codec adapters: bun ships
  Blob/File globals — verify once in the purity test.
- **`stage: HTMLElement` on the headless backend** (2.4) is typed with a null
  cast; if any future guard-path code touches `stage`, the cast surfaces as a
  crash — the self-check (2.7) covers the current path.
- **Stale sync measure during dispatch** (2.4): documented; if a future
  command starts depending on fresh mid-dispatch measurement, the headless
  backend needs a sync snapshot refresh hook.

## Execution notes for the implementing agent

- Package manager/runtime is **bun** (`bun add`, `bun run
  test|typecheck|lint`, `bun <script>.ts`). Tests: vitest; jsdom for
  existing, add a node project for purity/mcp tests.
- Lint baseline is dirty: 7 files fail on master. Only new failures count.
- Live browser verification: puppeteer + `window.__motif` against `bun run
  dev` with flagged Chrome (`CHROME_PATH`,
  `--enable-experimental-web-platform-features`) — see `scripts/eval-live.ts`
  for the launch recipe. The app's default theme is dark.
- Gallery demo photos live in `public/gallery/` and are seeded into the asset
  store (`src/content/gallery-seed.ts`) — never hot-link external images in
  fixtures.
- Do not modify `src/engine/{html-canvas,gl}` internals beyond the `probe.ts`
  extraction (2.1); the renderer is stable and verified.
- Commit per phase; each phase's acceptance list is the gate before moving
  on.
