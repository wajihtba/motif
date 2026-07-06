// The editor route. Client-only at runtime (the engine needs the real DOM):
// the controller is created eagerly (headless-safe); the backend, project
// record, and autosaver spin up after mount, when capabilities are known.

import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { RendererCapabilities } from "@/engine/backend"
import { AgentSession, httpTransport } from "@/agent/loop"
import { ChatStore } from "@/agent/chat"
import { EditorShell } from "@/components/editor/EditorShell"
import { UnsupportedGate } from "@/components/editor/UnsupportedGate"
import { EditorController } from "@/controller"
import { setGlslValidator } from "@/controller/normalize"
import { ensureGalleryAssets } from "@/content/gallery-seed"
import { detectCapabilities } from "@/engine/backend"
import { HtmlCanvasBackend } from "@/engine/html-canvas"
import { installAssetResolver, primeAssets } from "@/persistence/assets"
import { Autosaver, canvasThumb } from "@/persistence/autosave"
import { loadOrCreateProject } from "@/persistence/projects"

export const Route = createFileRoute("/editor/$projectId")({
  component: EditorPage,
})

function EditorPage() {
  const { projectId } = Route.useParams()
  const [ctrl] = useState(() => new EditorController())
  const [chat] = useState(() => new ChatStore())
  const [caps, setCaps] = useState<RendererCapabilities | null>(null)
  const [backend, setBackend] = useState<HtmlCanvasBackend | null>(null)
  const [saver, setSaver] = useState<Autosaver | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)

  useEffect(() => {
    const c = detectCapabilities()
    setCaps(c)
    installAssetResolver()
    if (!c.liveCanvas) return

    const b = new HtmlCanvasBackend()
    // Custom-GLSL layers sandbox-compile through the live GL context.
    setGlslValidator((kind, frag) => b.validateGlsl(kind, frag))

    // Object property, not a bare let: the cleanup mutation must be visible
    // through the async closure without always-falsy narrowing.
    const life = { disposed: false }
    let s: Autosaver | null = null
    void (async () => {
      // A deep-link straight into a gallery project may never have hit the home
      // seeder, so make sure its bundled photos are in the asset store first.
      await ensureGalleryAssets()
      await primeAssets()
      const record = await loadOrCreateProject(projectId)
      if (life.disposed) return
      // Hydrate BEFORE the shell mounts: attachBackend paints the loaded doc.
      ctrl.load(record.document)
      chat.hydrate(record.chat)
      s = new Autosaver({
        projectId,
        ctrl,
        chat,
        captureThumb: () => canvasThumb(b.canvas),
      })
      setSaver(s)
      setSession(
        new AgentSession({
          ctrl,
          chat,
          transport: httpTransport(),
          deliverFile: downloadBlob,
        })
      )
      setBackend(b)
    })()

    return () => {
      life.disposed = true
      s?.dispose()
      setGlslValidator(null)
      b.dispose()
    }
  }, [projectId, ctrl, chat])

  if (!caps) {
    return <div className="h-svh bg-background" />
  }
  if (!caps.liveCanvas) {
    return <UnsupportedGate />
  }
  if (!backend || !session) return <div className="h-svh bg-background" />

  return (
    <EditorShell
      ctrl={ctrl}
      backend={backend}
      chat={chat}
      session={session}
      saver={saver}
      projectId={projectId}
    />
  )
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
