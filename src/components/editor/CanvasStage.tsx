// The canvas well: infinite pan/zoom viewport, the engine's artboard, and the
// selection overlay. React NEVER re-renders the engine's DOM — the backend
// mounts into a ref'd div once; overlays are plain absolutely-positioned
// React elements in scene px that ride the viewport transform.

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { AgentSession } from "@/agent/loop"
import type { EditorController } from "@/controller"
import type { ContrastFinding } from "@/controller/contrast-lint"
import type { LintFinding } from "@/controller/lint"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { SnapGuide } from "@/engine/snap"
import type { TopBarViewport } from "./TopBar"
import { autofixLayout } from "@/controller/autofix"
import {
  lintContrastAfterSettle,
  runContrastFixSession,
} from "@/controller/contrast-check"
import { contrastFixPrompt } from "@/controller/contrast-lint"
import { lintLayout } from "@/controller/lint"
import { Interaction } from "@/engine/interaction"
import type { Handle } from "@/engine/resize"
import { CURSOR, HANDLES } from "@/engine/resize"
import { findNode } from "@/scene/model"
import { Viewport } from "@/engine/viewport"
import type { HoverStore } from "@/hooks/use-hover"
import { useEditorState } from "@/hooks/use-document-store"
import { useHoverId } from "@/hooks/use-hover"
import { InlineTextEditor } from "./InlineTextEditor"

export function CanvasStage({
  ctrl,
  backend,
  hover,
  session,
  onViewport,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  hover: HoverStore
  /** Agent session for the "Fix with AI" contrast action (optional — the
   *  button hides without it). */
  session?: AgentSession
  onViewport: (vp: TopBarViewport) => void
}) {
  const vpRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const [zoom, setZoom] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const { layout: layoutFindings, contrast: contrastFindings } =
    useLintFindings(ctrl, backend)
  const findings = useMemo<LintFinding[]>(
    () => [...layoutFindings, ...contrastFindings],
    [layoutFindings, contrastFindings]
  )
  const [autoFix, setAutoFix] = useState(false)
  useAutofix(ctrl, backend, layoutFindings, autoFix)
  const [fixingContrast, setFixingContrast] = useState(false)

  // One-shot, bounded, explicitly invoked — structurally cannot loop: each
  // node gets its ladder rung once, the terminal halo once, then it's left
  // flagged for the human/LLM.
  const fixContrast = () => {
    if (fixingContrast) return
    setFixingContrast(true)
    void runContrastFixSession({ ctrl, backend })
      .then(({ attempted, remaining }) => {
        if (!remaining.length) {
          toast.success(
            attempted
              ? `Fixed ${attempted} readability issue${attempted === 1 ? "" : "s"}`
              : "Contrast is clean"
          )
        } else {
          toast.warning(
            `${remaining.length} issue${remaining.length === 1 ? "" : "s"} need${remaining.length === 1 ? "s" : ""} a design decision — try “Fix with AI”`
          )
        }
      })
      .finally(() => setFixingContrast(false))
  }

  const fixContrastWithAI = () => {
    if (!session || !contrastFindings.length) return
    if (session.running) {
      toast.info("The assistant is busy — try again when it finishes")
      return
    }
    void session.send(contrastFixPrompt(contrastFindings))
    toast.info("Sent the readability issues to the assistant")
  }

  useEffect(() => {
    const vpEl = vpRef.current
    const fitEl = fitRef.current
    const mountEl = mountRef.current
    if (!vpEl || !fitEl || !mountEl) return

    // The stage mounts into a dedicated FIRST child so every overlay that
    // follows paints above the canvas (z-index auto → DOM order decides).
    backend.mount(mountEl)
    ctrl.attachBackend(backend)

    const viewport = new Viewport(vpEl, fitEl, {
      size: () => ({
        width: ctrl.store.state.document.scene.baseWidth,
        height: ctrl.store.state.document.scene.baseHeight,
      }),
      onChange: (z) => setZoom(z),
      onBlankPress: () =>
        ctrl.dispatch([{ command: "element.select", args: { ids: null } }]),
    })
    const interaction = new Interaction({
      stage: backend.stage,
      scene: () => ctrl.store.state.document.scene,
      selection: () => ctrl.store.state.selection,
      measure: (id) => backend.measure(id),
      scale: () => viewport.getScale(),
      isPanning: () => viewport.panning || viewport.space,
      dispatch: (calls, opts) => ctrl.dispatch(calls, opts),
      beginGesture: (label) => ctrl.beginGesture(label),
      endGesture: () => ctrl.endGesture(),
      onEditText: (node) => setEditingId(node.id),
      onGuides: setGuides,
      onHover: (node) => hover.setHover(node?.id ?? null),
    })
    interactionRef.current = interaction
    viewport.fitToView()

    const ro = new ResizeObserver(() => viewport.handleResize())
    ro.observe(vpEl)

    // Pointer-following scene shaders (spotlight etc.) read this.
    const onPointerMove = (e: PointerEvent) => {
      const r = backend.stage.getBoundingClientRect()
      if (!r.width || !r.height) return
      backend.setPointer(
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height
      )
    }
    vpEl.addEventListener("pointermove", onPointerMove)

    onViewport({
      get zoom() {
        return viewport.zoom
      },
      zoomBy: (f) => viewport.zoomBy(f),
      fit: () => viewport.fitToView(),
      reset: () => viewport.reset100(),
    })

    return () => {
      ro.disconnect()
      vpEl.removeEventListener("pointermove", onPointerMove)
      interaction.dispose()
      viewport.dispose()
      ctrl.detachBackend()
    }
    // mount-once: ctrl/backend are stable for the life of the page
  }, [])

  return (
    <div
      ref={vpRef}
      className="canvas-well relative flex-1 overflow-hidden"
      data-motif="viewport"
    >
      <div ref={fitRef}>
        {/* backend.stage mounts here (the artboard) — kept first so the
            selection/snap/lint overlays below paint above the canvas */}
        <div ref={mountRef} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
            width: scene.baseWidth,
            height: scene.baseHeight,
          }}
        />
        <HoverOverlay
          backend={backend}
          zoom={zoom}
          hover={hover}
          selection={state.selection}
        />
        <SelectionOverlay
          ctrl={ctrl}
          backend={backend}
          zoom={zoom}
          onResizeStart={(e, handle) =>
            interactionRef.current?.startResize(e, handle)
          }
        />
        <LintOverlay
          ctrl={ctrl}
          backend={backend}
          zoom={zoom}
          findings={findings}
        />
        <GuideOverlay guides={guides} zoom={zoom} />
        {editingId && (
          <InlineTextEditor
            ctrl={ctrl}
            backend={backend}
            nodeId={editingId}
            onClose={() => setEditingId(null)}
          />
        )}
        {/* empty scene: point at the chat (the product's front door) */}
        {!scene.root.children?.length && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ width: scene.baseWidth, height: scene.baseHeight }}
          >
            <div className="text-center" style={{ fontSize: 28 }}>
              <div className="text-muted-foreground">A blank canvas.</div>
              <div className="mt-2 text-muted-foreground/60">
                Describe your visual in the chat — or double-click to start
                editing once it exists.
              </div>
            </div>
          </div>
        )}
        {/* format label under the artboard */}
        <div
          className="absolute text-muted-foreground select-none"
          style={{
            top: scene.baseHeight + 12,
            left: 0,
            fontSize: Math.max(12 / zoom, 11),
          }}
        >
          {scene.baseWidth} × {scene.baseHeight} · {scene.format}
        </div>
      </div>
      {/* screen-space (outside the viewport transform): lint status, the
          layout auto-fix toggle, and the one-shot contrast fix actions. */}
      {(findings.length > 0 || autoFix) && (
        <div
          data-motif="autofix-toggle"
          className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-full border bg-background/90 py-1 pr-1 pl-3 text-xs shadow-md backdrop-blur"
        >
          <span
            className={
              findings.length
                ? contrastFindings.length
                  ? "text-[oklch(0.6_0.21_25)]"
                  : "text-[oklch(0.76_0.16_70)]"
                : "text-muted-foreground"
            }
          >
            {findings.length
              ? `⚠ ${
                  layoutFindings.length ? `${layoutFindings.length} layout` : ""
                }${layoutFindings.length && contrastFindings.length ? " · " : ""}${
                  contrastFindings.length
                    ? `${contrastFindings.length} readability`
                    : ""
                }`
              : "Design clean"}
          </span>
          {(layoutFindings.length > 0 || autoFix) && (
            <button
              type="button"
              role="switch"
              aria-checked={autoFix}
              onClick={() => setAutoFix((v) => !v)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                autoFix
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Fix layout {autoFix ? "on" : "off"}
            </button>
          )}
          {contrastFindings.length > 0 && (
            <button
              type="button"
              data-motif="contrast-fix"
              disabled={fixingContrast}
              onClick={fixContrast}
              className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {fixingContrast ? "Fixing…" : "Fix contrast"}
            </button>
          )}
          {contrastFindings.length > 0 && session && (
            <button
              type="button"
              data-motif="contrast-fix-ai"
              onClick={fixContrastWithAI}
              className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Fix with AI
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The same layout + contrast lint the agent sees, recomputed against
 *  MEASURED boxes whenever the scene settles (debounced past the engine's
 *  paint + webfont swaps). Layout findings land synchronously; contrast
 *  findings (which may pixel-sample a hidden export frame) resolve async.
 *  Kept as SEPARATE lists: layout feeds the reactive auto-fix toggle,
 *  contrast feeds the one-shot fix buttons — merging them once let the
 *  briefly-empty async gap reset the toggle's pass cap and loop the fixer. */
function useLintFindings(
  ctrl: EditorController,
  backend: HtmlCanvasBackend
): { layout: LintFinding[]; contrast: ContrastFinding[] } {
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const [layout, setLayout] = useState<LintFinding[]>([])
  const [contrast, setContrast] = useState<ContrastFinding[]>([])

  useEffect(() => {
    let cancelled = false
    const compute = () => {
      if (cancelled) return
      const current = ctrl.store.state.document.scene
      const measure = (id: string) => backend.measure(id)
      setLayout(lintLayout(current, measure))
      void lintContrastAfterSettle({
        scene: current,
        measure,
        probe: (id) => backend.probeStyle(id),
        revision: ctrl.history.lastSeq,
      }).then((next) => {
        if (!cancelled) setContrast(next)
      })
    }
    const t = setTimeout(() => {
      void backend.whenIdle().then(() => {
        compute()
        // A late webfont swap reflows boxes without a store change —
        // recompute once more when fonts finish.
        if (document.fonts.status === "loading") {
          void document.fonts.ready.then(compute)
        }
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [scene, backend, ctrl])

  return { layout, contrast }
}

/** While the toggle is ON, resolve fresh LAYOUT findings automatically. Each
 *  dispatch reflows the scene and re-runs the lint, so this converges as a
 *  fix→measure→fix loop — capped per warning burst so an unfixable finding
 *  (or two stubborn boxes trading places) can never ping-pong forever.
 *  Contrast findings are deliberately NOT handled here: they resolve async,
 *  and feeding them into a reactive loop resets the cap on every gap — the
 *  one-shot fix session (contrast-check.ts) owns those. */
const MAX_AUTOFIX_PASSES = 4

function useAutofix(
  ctrl: EditorController,
  backend: HtmlCanvasBackend,
  findings: LintFinding[],
  enabled: boolean
) {
  const passes = useRef(0)
  useEffect(() => {
    if (!enabled || !findings.length) {
      passes.current = 0 // clean (or off) — arm for the next burst
      return
    }
    if (passes.current >= MAX_AUTOFIX_PASSES) return
    const calls = autofixLayout(
      ctrl.store.state.document.scene,
      (id) => backend.measure(id),
      findings
    )
    if (!calls.length) return
    passes.current++
    ctrl.dispatch(calls, { source: "user" })
  }, [enabled, findings, ctrl, backend])
}

/** Hover affordance — a light outline on the element under the idle pointer,
 *  so "this is grabbable" reads before any click. Selected nodes keep their
 *  own (stronger) selection outline instead. */
function HoverOverlay({
  backend,
  zoom,
  hover,
  selection,
}: {
  backend: HtmlCanvasBackend
  zoom: number
  hover: HoverStore
  selection: string[]
}) {
  const hoverId = useHoverId(hover)
  if (!hoverId || selection.includes(hoverId)) return null
  const box = backend.measure(hoverId)
  if (!box) return null
  const hairline = 1.5 / Math.max(zoom, 0.05)
  return (
    <div
      data-motif="hover-outline"
      className="pointer-events-none absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        outline: `${hairline}px solid var(--primary)`,
        outlineOffset: hairline,
        opacity: 0.45,
      }}
    />
  )
}

/** Figma-style smart guides — the snap lines the drag is currently locked to. */
function GuideOverlay({ guides, zoom }: { guides: SnapGuide[]; zoom: number }) {
  if (!guides.length) return null
  const hairline = 1 / Math.max(zoom, 0.05)
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${i}`}
          data-motif="snap-guide"
          className="pointer-events-none absolute"
          style={
            g.axis === "x"
              ? {
                  left: g.pos - hairline / 2,
                  top: g.from,
                  width: hairline,
                  height: g.to - g.from,
                  background: "oklch(0.72 0.19 20)",
                }
              : {
                  left: g.from,
                  top: g.pos - hairline / 2,
                  width: g.to - g.from,
                  height: hairline,
                  background: "oklch(0.72 0.19 20)",
                }
          }
        />
      ))}
    </>
  )
}

/** Overlap/overflow badges — the same layout lint the agent sees, surfaced on
 *  canvas. Advisory only: outlines never intercept the pointer (dragging an
 *  element apart clears them live); the corner badge selects the offenders. */
function LintOverlay({
  ctrl,
  backend,
  zoom,
  findings,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  zoom: number
  findings: LintFinding[]
}) {
  if (!findings.length) return null
  const hairline = 1.5 / Math.max(zoom, 0.05)

  // Layout warnings are amber; readability (contrast) warnings are red —
  // they're the "this text can't be read" class, one step more severe.
  const tint = (kind: LintFinding["kind"]) =>
    kind === "low-contrast" ? "oklch(0.6 0.21 25)" : "oklch(0.76 0.16 70)"

  // One outline per offending node; one badge per finding, fanned out when
  // several findings share an anchor node.
  const flagged = new Set(findings.flatMap((f) => f.ids))
  const contrastFlagged = new Set(
    findings.filter((f) => f.kind === "low-contrast").flatMap((f) => f.ids)
  )
  const slots = new Map<string, number>()
  const badges = findings.map((f) => {
    const slot = slots.get(f.ids[0]) ?? 0
    slots.set(f.ids[0], slot + 1)
    return { f, slot }
  })

  return (
    <>
      {[...flagged].map((id) => {
        const box = backend.measure(id)
        if (!box) return null
        return (
          <div
            key={id}
            data-motif="lint-outline"
            className="pointer-events-none absolute"
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              outline: `${hairline}px dashed ${
                contrastFlagged.has(id)
                  ? "oklch(0.6 0.21 25)"
                  : "oklch(0.76 0.16 70)"
              }`,
              outlineOffset: hairline * 2,
            }}
          />
        )
      })}
      {badges.map(({ f, slot }, i) => {
        const box = backend.measure(f.ids[0])
        if (!box) return null
        return (
          <button
            key={`${f.kind}-${f.ids.join("-")}-${i}`}
            type="button"
            data-motif="lint-badge"
            title={f.message}
            className="pointer-events-auto absolute flex items-center justify-center"
            style={{
              left: box.x + box.w - 8 / zoom - (slot * 20) / zoom,
              top: box.y - 8 / zoom,
              width: 16 / zoom,
              height: 16 / zoom,
              borderRadius: 8 / zoom,
              fontSize: 11 / zoom,
              lineHeight: 1,
              background: tint(f.kind),
              color:
                f.kind === "low-contrast"
                  ? "oklch(0.98 0.01 25)"
                  : "oklch(0.2 0.02 70)",
              border: "none",
              cursor: "pointer",
            }}
            onClick={() =>
              ctrl.dispatch({
                command: "element.select",
                args: { ids: f.ids },
              })
            }
          >
            !
          </button>
        )
      })}
    </>
  )
}

/** Handle position as a fraction of the bounding box (0..1 on each axis). */
const HANDLE_POS: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
}

/** The selection halo: one unified bounding box around everything selected,
 *  with the eight resize handles on that box. A multi-selection keeps a faint
 *  per-member outline so you can still see what's in the group, but the handle
 *  grid (and the resize gesture) act on the group as a whole. Everything is
 *  sized in SCREEN px (÷ zoom) so the chrome stays a constant thickness as you
 *  zoom the infinite canvas. */
function SelectionOverlay({
  ctrl,
  backend,
  zoom,
  onResizeStart,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  zoom: number
  onResizeStart: (e: PointerEvent, handle: Handle) => void
}) {
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const z = Math.max(zoom, 0.05)
  const hairline = 1.5 / z

  const boxes = state.selection
    .map((id) => ({ id, box: backend.measure(id) }))
    .filter((b): b is { id: string; box: NonNullable<typeof b.box> } => !!b.box)
  if (!boxes.length) return null

  // Group bounding box = union of every selected member.
  const gx = Math.min(...boxes.map((b) => b.box.x))
  const gy = Math.min(...boxes.map((b) => b.box.y))
  const gw = Math.max(...boxes.map((b) => b.box.x + b.box.w)) - gx
  const gh = Math.max(...boxes.map((b) => b.box.y + b.box.h)) - gy

  // Handles only when at least one member can actually be resized.
  const resizable = state.selection.some((id) => {
    const n = findNode(scene, id)
    return n && !n.locked && n.layout.mode !== "flow"
  })
  const hs = 9 / z // visible handle side in scene px (constant on screen)
  const hit = 20 / z // larger transparent grab target around each handle

  return (
    <>
      {/* faint per-member outlines (only meaningful for a multi-selection) */}
      {boxes.length > 1 &&
        boxes.map(({ id, box }) => (
          <div
            key={id}
            className="pointer-events-none absolute"
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              outline: `${hairline}px solid var(--primary)`,
              outlineOffset: hairline,
              opacity: 0.4,
            }}
          />
        ))}

      {/* the unified bounding box + its handle grid */}
      <div
        data-motif="selection-box"
        className="pointer-events-none absolute"
        style={{
          left: gx,
          top: gy,
          width: gw,
          height: gh,
          outline: `${hairline}px solid var(--primary)`,
          outlineOffset: hairline,
        }}
      >
        {resizable &&
          HANDLES.map((handle) => {
            const [fx, fy] = HANDLE_POS[handle]
            return (
              // Outer element is a generous transparent grab target (so handles
              // stay easy to hit when the box is small or the zoom is low);
              // the inner dot is the visible handle.
              <div
                key={handle}
                data-resize-handle={handle}
                className="pointer-events-auto absolute flex items-center justify-center"
                style={{
                  left: fx * gw - hit / 2,
                  top: fy * gh - hit / 2,
                  width: hit,
                  height: hit,
                  cursor: CURSOR[handle],
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onResizeStart(e.nativeEvent, handle)
                }}
              >
                <div
                  style={{
                    width: hs,
                    height: hs,
                    background: "var(--background, #fff)",
                    border: `${1.25 / z}px solid var(--primary)`,
                    borderRadius: 2 / z,
                    boxShadow: `0 ${1 / z}px ${2 / z}px rgba(0,0,0,0.25)`,
                  }}
                />
              </div>
            )
          })}
      </div>
    </>
  )
}
