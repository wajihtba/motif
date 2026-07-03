// The editor route. Client-only at runtime (the engine needs the real DOM):
// the controller is created eagerly (headless-safe), the backend + gate only
// after mount, when capabilities are known.

import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { RendererCapabilities } from "@/engine/backend"
import { EditorShell } from "@/components/editor/EditorShell"
import { UnsupportedGate } from "@/components/editor/UnsupportedGate"
import { EditorController } from "@/controller"
import { installAssetResolver, primeAssets } from "@/persistence/assets"
import { setGlslValidator } from "@/controller/normalize"
import { detectCapabilities } from "@/engine/backend"
import { HtmlCanvasBackend } from "@/engine/html-canvas"

export const Route = createFileRoute("/editor/$projectId")({
  component: EditorPage,
})

function EditorPage() {
  // Starts EMPTY — the first watchable generation is the product moment.
  const [ctrl] = useState(() => new EditorController())
  const [caps, setCaps] = useState<RendererCapabilities | null>(null)
  const [backend, setBackend] = useState<HtmlCanvasBackend | null>(null)

  useEffect(() => {
    const c = detectCapabilities()
    setCaps(c)
    installAssetResolver()
    void primeAssets()
    if (c.liveCanvas) {
      const b = new HtmlCanvasBackend()
      setBackend(b)
      // Custom-GLSL layers sandbox-compile through the live GL context.
      setGlslValidator((kind, frag) => b.validateGlsl(kind, frag))
      return () => {
        setGlslValidator(null)
        b.dispose()
      }
    }
  }, [])

  if (!caps) {
    return <div className="h-svh bg-background" />
  }
  if (!caps.liveCanvas) {
    return <UnsupportedGate />
  }
  if (!backend) return <div className="h-svh bg-background" />

  return <EditorShell ctrl={ctrl} backend={backend} />
}
