# 01 — Architecture

Stack (fixed by this scaffold): **TanStack Start** (React 19, file router, server functions) +
Vite + Tailwind v4 + shadcn/ui, Bun. The server exists for exactly one hot reason: a safe,
streaming home for Anthropic API calls. The canvas engine itself is **client-only vanilla TS —
React never touches the per-frame path** (lint-enforced: no React imports under `src/engine/`).

## 1. Rendering engine decision: HTML-in-Canvas stays the core

The engine remains Chrome's HTML-in-Canvas API (`<canvas layoutsubtree>` +
`ctx.drawElementImage`), and this is a deliberate, examined bet:

- **The agent authors in its native medium.** LLMs are exceptional at HTML/CSS. Real browser
  typography, line breaking, flexbox, and gradients come free and correct. Every alternative
  canvas engine (Fabric/Konva/custom WebGL scene graphs) forces reimplementing text layout and
  flex in JS and forces the agent into a bespoke vocabulary — surrendering the core advantage.
- **The alternatives for reading DOM pixels are worse.** `html2canvas` re-implements CSS with
  notorious fidelity gaps; SVG `foreignObject` covers a limited CSS subset with font/taint pain;
  satori is a tiny CSS subset with no shader path. Only `drawElementImage` yields pixel-perfect
  browser-rendered DOM that can feed live WebGL shaders.
- **The flag risk is hedged three ways.**
  1. A `RendererBackend` interface isolates every platform assumption (§3).
  2. A startup **platform-conformance self-test** (~10 cases: immediate-children rule, paint-record
     refresh timing, DPR mapping) surfaces Chrome-version regressions instead of silently
     corrupting frames.
  3. A **headless-Chrome server export path** is designed in: `--headless=new
     --enable-experimental-web-platform-features` runs this exact engine with a real GPU and
     correct shader output (verified in v1 development). The TanStack server can therefore run the
     same engine for pixel-perfect PNG/video export for users whose browser lacks the flag; live
     canvas editing becomes a progressive enhancement over a plain DOM preview (no shader effects)
     elsewhere. The seam is documented now; implementation is post-M7.

### Platform constraints the whole design obeys (hard-won in v1)

- `drawElementImage(el)` accepts only **immediate children** of the canvas, and only ones with a
  **cached paint record** from the layout pass. Mid-frame DOM promotion throws.
- Paint records refresh only **between rendering lifecycles** — after any DOM mutation, wait one
  rAF before drawing, or you paint stale state.
- `drawElementImage` is itself devicePixelRatio-aware: call it **under an identity transform**, run
  the pipeline in device px (see `dpr.ts`, [02-performance.md](02-performance.md)).
- **CSS animation does not paint in-canvas** (transforms on canvas children are ignored for
  drawing and don't fire the paint event). All motion is engine-driven, sampled per frame.

## 2. Module layout

```
src/
  engine/                    # client-only vanilla TS — NO React (lint rule)
    backend.ts               # RendererBackend interface + capability gate ("unsupported" screen)
    html-canvas/             # the HTML-in-Canvas backend (primary engine)
      measure.ts             # hidden measurement host, box reading, dirty tracking
      paint-units.ts         # unit-splitting compiler (tree → flat unit list)
      compositor.ts          # per-frame draw: units → scratch → GL fx → visible canvas
      dom-patch.ts           # incremental DOM patching from store patches (the ONLY DOM writer)
      dpr.ts                 # all device-pixel rules in ONE place
      loop.ts                # demand-driven rAF loop (idles at 0% CPU), lifecycle gating
    gl/                      # WebGL2 context, ping-pong FBOs, program cache, shader preludes
    animator.ts              # track sampling: sampleAt(t) → per-unit {x,y,scale,rotate,opacity}
    export/
      image.ts               # toBlob per format
      video.ts               # deterministic frame-stepped WebCodecs pipeline
      mux.ts                 # mp4-muxer / webm-muxer wrappers
  scene/                     # pure data + pure functions (runs anywhere, incl. tests)
    types.ts                 # Document model v2 (§4)
    layout.ts                # anchor/normalized + stack layout → CSS compile (port from v1)
    theme.ts                 # OKLCH token sets (port from v1)
    variants.ts              # per-format override resolution
    validate.ts              # HTML sanitizer, CSS deny-list, zod schemas
  effects/                   # PORT from v1: same 5-kind registry + self-registration
    core/{registry,types}.ts
    scene-shaders/ element-shaders/ pixel/ filters/ anims/
  controller/                # the agentic seam
    store.ts                 # document store: immer produceWithPatches + subscribe
    dispatch.ts              # command router; transactions; emits patches + diffs
    commands/*.ts            # ~25–35 self-describing commands (port + extend)
    normalize.ts             # normalize gate v2 (see 03-agent-first.md)
    describe.ts              # world model builder (levels: summary/tree/node/capabilities)
    history.ts               # undo/redo from inverse patches
  agent/
    tools.ts                 # the 4 tool definitions (schemas generated from command registry)
    loop.ts                  # client-side turn driver: SSE in → dispatch → tool_result out
    partial-json.ts          # incremental JSON parser for streamed scene generation
    prompts.ts               # system prompt assembly (static core + brand kit + brief)
  server/
    agent.ts                 # POST /api/agent — proxies Anthropic, streams SSE, key server-side
  persistence/
    idb.ts                   # IndexedDB (projects JSON, assets as Blobs)
    import-export.ts         # .motif zip (fflate): project.json + assets/
  components/
    chat/  editor/  panels/  ui/   # React; thin adapters over controller via useSyncExternalStore
  routes/
    index.tsx  editor.$projectId.tsx  api/agent.ts
```

Dependencies to add: `@anthropic-ai/sdk`, `immer`, `idb`, `zod`, `mp4-muxer`, `webm-muxer`,
`fflate`.

Ports from v1 (parent repo `src/lib/`): `scene/types.ts` (base of the model), `scene/layout.ts`,
`scene/theme.ts`, `effects/core/registry.ts` + all shader/filter/anim catalogs,
`core/controller.ts` command catalog (re-shaped), `core/normalize.ts` (extended), the DPR and
paint-record lessons from `engine/renderer.ts`, and the content catalogs (`content/*`).

## 3. RendererBackend interface

```ts
interface RendererBackend {
  readonly capabilities: { liveCanvas: boolean; shaders: boolean; video: boolean };
  mount(host: HTMLElement): void;
  applyPatches(patches: ScenePatch[]): void;   // incremental; classifies invalidation itself
  renderFrame(t: number): void;                 // deterministic: same t → same pixels
  measure(): Map<NodeId, Box>;                  // computed boxes for describe()/hit-testing
  exportFrame(t: number, w: number, h: number): Promise<CanvasImageSource>;
  whenIdle(): Promise<void>;
  dispose(): void;
}
```

The HTML-in-Canvas backend is the only implementation this remake builds. A DOM-preview fallback
(the measurement host shown visibly, CSS-transform animation, no shader effects) is specced by
this interface but deliberately not built yet.

## 4. Document model v2

Evolves v1's `Scene` (which was sound) rather than replacing it:

```ts
Project {
  id, name, createdAt
  brandKit: { logoAssetId?, tokens: Record<string,string>,   // OKLCH palette → --primary etc.
              fonts: { heading, body }, voice?: string }
  assets: Record<AssetId, { kind: 'image'|'logo'|'font', name, mime, blobRef }>
  documents: DocumentMeta[]
}

Document {
  id, name
  brief: { goal?, audience?, tone?, mustInclude?: string[], notes?: string } // durable design intent, agent-writable
  scene: Scene                    // canonical, at primary-format size
  formats: FormatVariant[]        // multi-format without forking content
}

Scene {                            // v1 shape plus:
  baseWidth, baseHeight, format, background, theme, stylesheet?, root, effects[]
  animations: AnimTrack[]          // now seconds-based: { start, duration, loop?, stagger? }
  timeline: { duration: number, fps: 30 }   // NEW — governs video export & preview scrub
}

FormatVariant {
  format: FormatId                 // 'ig-post' | 'ig-story' | 'fb-cover' | 'x-header' | 'og' | 'pin' | 'yt'
  width, height
  overrides: Array<{ nodeId, layout?, css?, hidden? }>   // sparse, layout/visibility-ONLY by type
}
```

Decisions and rationale:

- **One canonical scene + sparse per-format overrides**, not N independent scenes. Content
  (headline text, image, theme) stays single-sourced — edit once, all formats update; only
  layout/visibility diverges. v1's resolution-independent layout (anchor + normalized offsets, or
  flex stacks, compiled to CSS) makes most variants free; overrides handle aspect-ratio breakages.
  The override type structurally cannot carry content keys, so variants can never fork.
- **Video = the same scene with a timeline**, not a separate document kind. Marketing motion here
  is property animation of existing elements (text reveals, kinetic badges, ambient float,
  animated effect params). Multi-scene/shot sequencing is the single biggest scope trap — excluded.
- **Assets by reference** (`image: 'asset:hero'`), resolved to object URLs at mount. Keeps the
  document JSON small, diffable, and export-portable; also closes the cross-origin taint hazards
  v1 fought.
- **`brief` lives in the document, not the chat**: durable memory of design intent that survives
  conversation compaction and reloads.

## 5. Flat paint-unit renderer

This is the fix for v1's fatal flaw: v1 painted the whole tree in one `drawElementImage(rootEl)`
call (only immediate children have paint records), so per-element transform/opacity — i.e. all
animation — was impossible, and effect masking needed a fragile two-frame capture handshake.

**Unit-splitting rule** (compiler pass; runs only on structural/targeting changes):
a node becomes a *unit root* iff (a) it is targeted by any enabled `AnimTrack`, (b) it is targeted
by any enabled element-scope `EffectLayer`, or (c) it is the scene root (the "background unit"
holding everything not extracted). Units are ordered by document paint order. A unit contains its
full nested subtree — arbitrary CSS nesting *inside* a unit is fine; the platform only forbids
drawing deep descendants directly.

**Measurement pass:**

- A hidden measurement host (`position:fixed; visibility:hidden; contain:strict; width/height =
  baseWidth/Height`) renders the *full nested* scene tree with compiled layout CSS. The browser
  does layout; we read `getBoundingClientRect` per unit root (and per node, for `describe()` boxes
  and hit-testing).
- The canvas DOM (`<canvas layoutsubtree>`) contains only the flat unit list: each unit root
  duplicated as an absolutely-positioned immediate child at its measured box.
- **Layout-hole preservation:** where an extracted unit participated in flow layout (stacks), the
  background unit keeps a `visibility:hidden` placeholder with the measured fixed size, so
  siblings don't reflow and nothing double-paints.
- Invalidation is **command-driven, not observer-driven**. Dispatch classifies each patch:
  *style-only* (patch inline style, no re-measure), *layout-affecting* (re-measure the affected
  subtree), *structural/targeting* (re-run the unit split). No MutationObserver, no per-frame
  measurement.

**Frame composition** (all in device px, identity transform):

```
for unit in unitsInPaintOrder:
  s = animator.sampleAt(t, unit)                    // {x,y,scale,rotate,opacity}
  if unit.effects.length or s is non-identity:
      drawElementImage(unit.el) → pooled scratch     // unit alone = its own silhouette/mask
      if effects: GL chain over scratch (ping-pong FBOs); backdrop-reading effects sample the
                  visible canvas as accumulated SO FAR (that IS "behind me") — in-frame, no handshake
      ctx.drawImage(result → visible, with unit transform/opacity about its center)
  else:
      ctx.drawElementImage(unit.el, x, y)            // static fast path, direct
scene shaders: visible canvas → GL texture → full-frame passes → draw back
```

What this eliminates vs v1: the two-frame isolation handshake is gone entirely (a unit drawn alone
on scratch *is* its content mask; the running accumulation *is* the backdrop). What remains: after
any DOM patch the compositor waits one rAF before drawing (paint-record lifecycle); `loop.ts`
encodes this as a `dirtyDom → skip-one-frame` state and is the only place that knows it.

## 6. The agent loop

**Topology: client-driven loop, server-proxied model calls.** Tool execution must happen in the
browser (the scene, layout engine, and GL live there), so the turn driver is client-side:

1. Client POSTs `{ messages, projectContext }` to `POST /api/agent`.
2. The server route builds the request — system prompt (static core, cached) + brand-kit/brief
   block + tools (cached) — and calls Anthropic with `client.messages.stream(...)`
   (`@anthropic-ai/sdk`), re-emitting SSE to the browser. The API key exists only in server env.
3. Client consumes SSE: text deltas → chat bubbles; `tool_use` blocks → `agent/loop.ts` runs them
   through `controller.dispatch` (one transaction per tool call).
4. On `stop_reason: "tool_use"`, the client appends tool results (compact diffs — see
   [03-agent-first.md](03-agent-first.md)) and loops to step 1 until `end_turn`.

**Model: `claude-opus-4-8`** with adaptive thinking, effort `high` (dropped to `medium` for
trivial single-command turns — same model, cache-safe). One model for the whole session keeps the
prompt cache coherent. Cache discipline: `cache_control` breakpoint after tools+system (stable) and
on the conversation tail; the volatile per-turn scene summary goes after the last breakpoint.

**Streaming partial scenes:** `motif_generate` uses eager (fine-grained) tool-input streaming;
`agent/partial-json.ts` incrementally parses arriving `input_json_delta`s and applies each
*completed* top-level node/effect/animation to the live document as it closes. The canvas visibly
assembles element-by-element. The system prompt instructs background-first node ordering for this
reason. `motif_edit` batches apply the same way, command by command.

## 7. Undo/redo — command-sourced history

- `controller/store.ts` wraps the document in immer `produceWithPatches`; every dispatch
  transaction yields `(patches, inversePatches)`.
- History entry = `{ label, source: 'agent'|'user', commandIds, patches, inversePatches,
  selectionBefore/After }`. Undo applies inverse patches and re-syncs the DOM through the same
  incremental patcher — never a world rebuild.
- One agent tool call = one entry; one UI gesture = one entry (drag/slider coalesced until commit).
- **immer over Zustand or hand-rolled patching**: structural sharing + inverse patches for free +
  framework independence. React consumes the store through a ~15-line `useSyncExternalStore`
  adapter. History is a 200-entry ring buffer.

## 8. Persistence — local-first

- IndexedDB (`idb`): `projects` store (JSON) + `assets` store (Blobs). Autosave debounced 500ms
  after each history commit, with a "saved" indicator.
- `.motif` export/import: a zip (fflate) of `project.json` + `assets/*`. Round-trips everything
  including the brand kit.
- Chat transcripts persist per document (they are the design-rationale record), size-capped with a
  compaction summary.
- Server sync deliberately deferred; the `save/load/list` interface is where a remote adapter
  slots in later.

## 9. Inline text editing (redesigned)

Double-click a text unit → mount a `contenteditable` DOM overlay absolutely positioned over the
canvas at the unit's screen box, cloning its computed styles; the compositor keeps painting
everything *except* that unit (one flag — no rebuild). On commit (blur/Enter), dispatch
`element.setHtml` → incremental DOM patch of the measurement tree and the unit → one rAF → the
unit repaints. Undoable like any other command. (v1 floated the element out and rebuilt the whole
scene on blur; that's gone.)
