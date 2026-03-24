// Hook to bridge imperative Motif engine with React state

import { useCallback, useEffect, useReducer, useRef } from "react"
import { bus, interaction, renderer, store, viewport } from "~/lib/motif"

/** Forces React re-render when engine state changes */
export function useMotifState() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    interaction.setOnChange(forceUpdate)

    const unsubs = [
      bus.on("slide:created", forceUpdate),
      bus.on("slide:switched", forceUpdate),
      bus.on("slide:deleted", forceUpdate),
      bus.on("slide:resized", forceUpdate),
      bus.on("node:added", forceUpdate),
      bus.on("node:removed", forceUpdate),
      bus.on("node:mutated", forceUpdate),
      bus.on("node:selected", forceUpdate),
      bus.on("tool:changed", forceUpdate),
      bus.on("viewport:changed", forceUpdate),
      bus.on("history:restored", forceUpdate),
    ]

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [])

  return {
    slides: store.slides,
    activeSlideId: store.activeId,
    selectedId: interaction.selectedId,
    editingId: interaction.editingId,
    tool: interaction.tool,
    zoom: viewport.zoom,
    state: interaction.state,
  }
}

/** Sets up the viewport canvas with pointer/keyboard events */
export function useViewportSetup() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  useEffect(() => {
    const vp = viewportRef.current
    const wr = wrapperRef.current
    const ov = overlayRef.current
    if (!vp || !wr || !ov) return

    viewport.setElements(wr, vp)
    renderer.setOverlay(ov)
    store.setContainer(wr)

    // Create first slide if none
    if (store.slides.length === 0) {
      store.createSlide()
    }

    // Fit to view
    requestAnimationFrame(() => viewport.fit())

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      interaction.onKeyDown(e)
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Middle mouse or hand tool = pan
    if (e.button === 1 || interaction.tool === "hand") {
      isPanning.current = true
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        px: viewport.panX,
        py: viewport.panY,
      }
      e.preventDefault()
      return
    }

    if (e.button === 0) {
      interaction.onPointerDown(e.nativeEvent)
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      viewport.panX =
        panStart.current.px + (e.clientX - panStart.current.x)
      viewport.panY =
        panStart.current.py + (e.clientY - panStart.current.y)
      viewport.update()
      return
    }
    interaction.onPointerMove(e.nativeEvent)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false
      return
    }
    interaction.onPointerUp(e.nativeEvent)
  }, [])

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    interaction.onDoubleClick(e.nativeEvent)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const vr = viewportRef.current?.getBoundingClientRect()
    if (!vr) return

    const cx = e.clientX - vr.left
    const cy = e.clientY - vr.top
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    viewport.zoomTo(viewport.zoom * delta, cx, cy)
  }, [])

  return {
    viewportRef,
    wrapperRef,
    overlayRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onWheel,
  }
}
