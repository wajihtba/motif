# 02 — Performance Plan

Performance is a feature here: the pitch is "chat and watch the design assemble", which dies if
the preview stutters or exports crawl. These budgets are acceptance criteria, measured in the
milestone demos ([04-milestones-risks.md](04-milestones-risks.md)).

## 1. Budgets

| Metric | Target |
|---|---|
| Preview framerate, 2 animated units + 1 animated scene shader @ 1080×1080 | 60fps, ≤8ms main-thread per frame |
| Idle CPU (nothing animating, no interaction) | 0% — rAF loop parked |
| Chat edit → visible canvas update (excluding model latency) | ≤100ms |
| Video export, 10s @ 30fps @ 1080×1080 mp4 | ≤15s wall clock |
| PNG export | ≤300ms |

## 2. GPU-resident effect chain (kills v1's readbacks)

- One shared WebGL2 context; a ping-pong FBO pair per pipeline run; program cache keyed by
  effect id + frag hash.
- v1's CPU pixel ops (`pixel/ops.ts` — dither, disintegrate, …) are **rewritten as fragment
  shaders**. Their registry entries keep the same ids/params, so scenes stay compatible.
- **Zero `getImageData` anywhere in the frame path** (asserted in tests). Per-frame CPU↔GPU
  traffic: N unit uploads (`texImage2D` from scratch canvases — unavoidable; HTML paint originates
  in 2D) + one readback-free composite (`drawImage(glCanvas)`). The scene-shader pass uploads the
  composed frame once, only when a scene shader is active.

## 3. Paint-unit caching & invalidation

- Units with static content and static effect params render once to a cached texture; recomposite
  is then transform-only. A spinning badge costs zero re-uploads per frame.
- A unit's texture invalidates only on its own DOM dirty flag or a non-time effect-param change;
  `u_time`-animated effects re-run GL but reuse the uploaded source texture.
- Scratch canvases are pooled and sized to unit boxes.

## 4. Incremental DOM patching

- `dom-patch.ts` is the **single writer** to both the measurement host and the canvas DOM,
  translating store patches into minimal DOM ops (style property sets, one-node `innerHTML` swap,
  insert/remove). Full re-mount happens only on document load, format switch, or a unit-split
  change.
- Measurement re-runs only on layout-class patches, scoped to the affected unit's subtree.
- The demand-driven loop from v1 is retained verbatim in spirit: paint only when dirty, animated,
  or interacting; park otherwise.

## 5. Deterministic video export (WebCodecs)

Per frame `i`:

```
animator.seek(i / fps) → apply DOM-visible state → await rAF   // paint-record lifecycle
→ compositor.renderFrame(t) → new VideoFrame(canvas, { timestamp: i * 1e6 / fps })
→ encoder.encode(frame, { keyFrame: i % 60 === 0 }) → frame.close()
```

- **Encoder/mux decision:** WebCodecs `VideoEncoder` with H.264 (`avc1.42003e`) muxed by
  **mp4-muxer**; VP9 + **webm-muxer** fallback chosen per `VideoEncoder.isConfigSupported`
  (H.264 encode is unavailable on some Linux/Chromium builds — the fallback is first-class, and
  the UI states which container it produced). mp4/H.264 is what social platforms ingest without
  transcoding.
- **MediaRecorder rejected**: realtime-clocked (cannot frame-step deterministically) and drops
  frames under load. GIF is out of scope (later `modern-gif` add-on if ever).
- Backpressure: await when `encoder.encodeQueueSize > 4`. Encoding is hardware-accelerated and
  async; the muxer appends in memory.
- Progress UI: frames-encoded / total, cancelable; the preview canvas shows the stepped frames as
  they render (free feedback).
- Determinism requirement: same `t` → same pixels (verified by exporting twice and comparing a
  middle frame). This is what makes the export loop and the timeline scrubber trustworthy.

The rAF-paced step is a platform constraint (paint records refresh only between rendering
lifecycles), which bounds export speed to ~1 frame per display frame in the worst case — 300
frames ≈ 5s at 60Hz plus encode overhead, comfortably inside the 15s budget.

## 6. DPR rules (one module: `engine/html-canvas/dpr.ts`)

Hard-won in v1 and centralized here so no other file reasons about DPR:

- `drawElementImage` maps the element's CSS px → device px by `devicePixelRatio` **itself**. It
  must be called under an **identity transform**; layering your own `setTransform(dpr, …)`
  double-scales (~dpr²) and flings content off-frame on retina.
- The interactive canvas backing store = CSS size × dpr; the whole paint/sample/composite pipeline
  runs in device px; unit boxes are stored in CSS px and converted at draw time by one function.
- Any GL overlay canvas gets its CSS size pinned explicitly (its backing is dpr-scaled; without an
  explicit CSS size it falls back to intrinsic size and renders 2× too large on retina).
- **Export bypasses DPR entirely**: the export canvas backing = exact format pixels, dpr forced
  to 1, separate from the interactive canvas.
