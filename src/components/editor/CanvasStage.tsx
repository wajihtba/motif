// The canvas well: infinite pan/zoom viewport, the engine's artboard, and the
// selection overlay. React NEVER re-renders the engine's DOM — the backend
// mounts into a ref'd div once; overlays are plain absolutely-positioned
// React elements in scene px that ride the viewport transform.

import { useEffect, useRef, useState } from "react"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { TopBarViewport } from "./TopBar"
import { Interaction } from "@/engine/interaction"
import { Viewport } from "@/engine/viewport"
import { useEditorState } from "@/hooks/use-document-store"
import { InlineTextEditor } from "./InlineTextEditor"

export function CanvasStage({
  ctrl,
  backend,
  onViewport,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  onViewport: (vp: TopBarViewport) => void
}) {
  const vpRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const [zoom, setZoom] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const state = useEditorState(ctrl)
  const scene = state.document.scene

  useEffect(() => {
    const vpEl = vpRef.current
    const fitEl = fitRef.current
    if (!vpEl || !fitEl) return

    backend.mount(fitEl)
    ctrl.attachBackend(backend)

    const viewport = new Viewport(vpEl, fitEl, {
      size: () => ({
        width: ctrl.store.state.document.scene.baseWidth,
        height: ctrl.store.state.document.scene.baseHeight,
      }),
      onChange: (z) => setZoom(z),
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
        {/* backend.stage mounts here (the artboard) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
            width: scene.baseWidth,
            height: scene.baseHeight,
          }}
        />
        <SelectionOverlay
          ctrl={ctrl}
          backend={backend}
          zoom={zoom}
          onResizeStart={(e) => interactionRef.current?.startResize(e)}
        />
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
    </div>
  )
}

function SelectionOverlay({
  ctrl,
  backend,
  zoom,
  onResizeStart,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  zoom: number
  onResizeStart: (e: PointerEvent) => void
}) {
  const state = useEditorState(ctrl)
  const primary = state.selection[state.selection.length - 1]
  const hairline = 1.5 / Math.max(zoom, 0.05)

  return (
    <>
      {state.selection.map((id) => {
        const box = backend.measure(id)
        if (!box) return null
        const isPrimary = id === primary
        return (
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
            }}
          >
            {isPrimary && (
              <div
                data-resize-handle
                className="pointer-events-auto absolute bg-primary"
                style={{
                  right: -6 / zoom,
                  bottom: -6 / zoom,
                  width: 10 / zoom,
                  height: 10 / zoom,
                  borderRadius: 2 / zoom,
                  cursor: "nwse-resize",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onResizeStart(e.nativeEvent)
                }}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
