// The editor frame: top bar / (chat rail | canvas well | inspector).
// The chat rail is the primary panel — the agent and the direct-manipulation
// surface edit the same document through the same command seam.

import { useEffect, useState } from "react"
import type { AgentSession } from "@/agent/loop"
import type { ChatStore } from "@/agent/chat"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { Autosaver } from "@/persistence/autosave"
import type { TopBarViewport } from "./TopBar"
import { ChatRail } from "@/components/chat/ChatRail"
import { InspectorTabs } from "@/components/panels/InspectorTabs"
import { CanvasStage } from "./CanvasStage"
import { Timeline } from "./Timeline"
import { TopBar } from "./TopBar"

export function EditorShell({
  ctrl,
  backend,
  chat,
  session,
  saver,
  projectId,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  chat: ChatStore
  session: AgentSession
  saver: Autosaver | null
  projectId: string
}) {
  const [viewport, setViewport] = useState<TopBarViewport | null>(null)

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
      <TopBar
        ctrl={ctrl}
        viewport={viewport}
        saver={saver}
        chat={chat}
        projectId={projectId}
      />
      <div className="flex min-h-0 flex-1">
        <ChatRail ctrl={ctrl} chat={chat} session={session} />
        <CanvasStage ctrl={ctrl} backend={backend} onViewport={setViewport} />
        <InspectorTabs ctrl={ctrl} />
      </div>
      <Timeline ctrl={ctrl} backend={backend} />
    </div>
  )
}
