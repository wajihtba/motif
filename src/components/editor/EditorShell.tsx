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
import { CommandPalette } from "./CommandPalette"
import { HelpDialog } from "./HelpDialog"
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // App-level shortcuts: ⌘K palette, ⌘/ help, ⌘D duplicate, ⌘S save-now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const t = e.target as HTMLElement
      const typing =
        t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA"
      if (e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (e.key === "/") {
        e.preventDefault()
        setHelpOpen((o) => !o)
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault()
        void saver?.flush()
      } else if (e.key.toLowerCase() === "d" && !typing) {
        e.preventDefault()
        const selection = ctrl.store.state.selection
        if (selection.length) {
          ctrl.dispatch(
            selection.map((id) => ({
              command: "element.duplicate",
              args: { id },
            })),
            { label: "Duplicate" }
          )
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ctrl, saver])

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
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        ctrl={ctrl}
        backend={backend}
        viewport={viewport}
        openHelp={() => setHelpOpen(true)}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
