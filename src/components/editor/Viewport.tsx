import { useViewportSetup } from "~/hooks/useMotif"
import { interaction, kernel, store, viewport } from "~/lib/motif"
import type { ComponentDef } from "~/lib/motif/types"
import { components } from "~/lib/motif/components"
import { useCallback } from "react"

export function Viewport() {
  const {
    viewportRef,
    wrapperRef,
    overlayRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onWheel,
  } = useViewportSetup()

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const name = e.dataTransfer.getData("text/plain")
    const def = components.find((c) => c.name === name)
    if (!def) return

    const slide = store.active()
    if (!slide) return

    const pos = viewport.screenToSlide(e.clientX, e.clientY)

    // Check if dropping onto a container
    const container = interaction.hitContainer(e.clientX, e.clientY)
    const id = kernel.addComponent(
      slide.id,
      def,
      pos.x - def.w / 2,
      pos.y - def.h / 2,
      container?.id,
      container?.insertIdx
    )
    if (id) interaction.select(id)
  }, [])

  return (
    <div
      ref={viewportRef}
      className="m-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div ref={wrapperRef} className="m-canvas-wrapper">
        {/* Slide hosts are appended here by SlideStore */}
      </div>
      <div ref={overlayRef} className="m-overlay">
        {/* Selection handles rendered here by OverlayRenderer */}
      </div>
    </div>
  )
}
