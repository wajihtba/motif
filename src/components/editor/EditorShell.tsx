// The editor frame: top bar / (chat rail | canvas well | inspector).
// The chat rail is the primary panel — the agent and the direct-manipulation
// surface edit the same document through the same command seam.

import { useEffect, useMemo, useState } from "react"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { TopBarViewport } from "./TopBar"
import { AgentSession, httpTransport } from "@/agent/loop"
import { ChatStore } from "@/agent/chat"
import { ChatRail } from "@/components/chat/ChatRail"
import { InspectorTabs } from "@/components/panels/InspectorTabs"
import { CanvasStage } from "./CanvasStage"
import { Timeline } from "./Timeline"
import { TopBar } from "./TopBar"

export function EditorShell({
  ctrl,
  backend,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
}) {
  const [viewport, setViewport] = useState<TopBarViewport | null>(null)
  const chat = useMemo(() => new ChatStore(), [])
  const session = useMemo(
    () =>
      new AgentSession({
        ctrl,
        chat,
        transport: httpTransport(),
        deliverFile: downloadBlob,
      }),
    [ctrl, chat]
  )

  // GPU watchdog: two over-budget frames disable custom-GLSL layers and put
  // the reason in the transcript, where the agent will see it next turn.
  useEffect(() => {
    backend.onBudgetOverrun = (layerIds) => {
      ctrl.dispatch(
        layerIds.map((id) => ({
          command: "fx.update",
          args: { id, patch: { enabled: false } },
        })),
        { source: "system", label: "GPU watchdog" }
      )
      chat.addText(
        "assistant",
        `Disabled ${layerIds.length} custom shader${layerIds.length === 1 ? "" : "s"} — the frame budget was exceeded twice.`
      )
    }
    return () => {
      backend.onBudgetOverrun = null
    }
  }, [backend, ctrl, chat])

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-sm">
      <TopBar ctrl={ctrl} viewport={viewport} />
      <div className="flex min-h-0 flex-1">
        <ChatRail ctrl={ctrl} chat={chat} session={session} />
        <CanvasStage ctrl={ctrl} backend={backend} onViewport={setViewport} />
        <InspectorTabs ctrl={ctrl} />
      </div>
      <Timeline ctrl={ctrl} backend={backend} />
    </div>
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
