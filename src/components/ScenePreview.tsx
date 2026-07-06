// A static, DOM-rendered thumbnail of a Scene for the home grid. Because Motif
// scenes ARE real HTML/CSS, we can paint an accurate preview with the same DOM
// builder the engine's measurement host uses — no <canvas>, no experimental
// flag, no captured bitmap required. Canvas-only effect shaders don't appear
// here (they need the GL compositor), but the composition — layout, colour,
// type, gradients, photos — is faithful, which is what a card needs to show.
//
// The scene is built at its native pixel size into a fixed "stage", then scaled
// to object-contain within the card via a ResizeObserver.

import { useLayoutEffect, useRef } from "react"
import type { Scene } from "@/scene/types"
import { buildNodeEl } from "@/engine/html-canvas/build"
import { themeVars } from "@/scene/theme"

export function ScenePreview({ scene }: { scene: Scene }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const stage = stageRef.current
    if (!frame || !stage) return

    const { baseWidth: w, baseHeight: h } = scene

    // Paint the scene tree into a fixed-size stage.
    stage.replaceChildren()
    stage.style.width = `${w}px`
    stage.style.height = `${h}px`
    stage.style.background = scene.background
    // Theme tokens are CSS custom properties — they MUST go through
    // setProperty; assigning them onto style (Object.assign) silently no-ops,
    // and every var(--primary)/var(--ink) would fall back to the app shell.
    for (const [key, value] of Object.entries(themeVars(scene.theme))) {
      stage.style.setProperty(key, value)
    }
    stage.appendChild(buildNodeEl(scene.root, {}, true))

    // Object-contain scale that tracks the card size.
    const fit = () => {
      const fw = frame.clientWidth
      const fh = frame.clientHeight
      if (!fw || !fh) return
      const scale = Math.min(fw / w, fh / h)
      stage.style.transform = `translate(-50%, -50%) scale(${scale})`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [scene])

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full overflow-hidden"
      aria-hidden
    >
      <div
        ref={stageRef}
        className="absolute top-1/2 left-1/2"
        style={{ transformOrigin: "center center" }}
      />
    </div>
  )
}
