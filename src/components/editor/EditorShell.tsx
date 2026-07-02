// The editor frame: top bar / (chat rail placeholder | canvas well |
// inspector). The chat rail becomes real in M2 — its slot is reserved so the
// layout doesn't reflow when the product moment arrives.

import { useState } from "react"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { TopBarViewport } from "./TopBar"
import { CanvasStage } from "./CanvasStage"
import { TopBar } from "./TopBar"
import { InspectorTabs } from "@/components/panels/InspectorTabs"

export function EditorShell({
  ctrl,
  backend,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
}) {
  const [viewport, setViewport] = useState<TopBarViewport | null>(null)

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-sm">
      <TopBar ctrl={ctrl} viewport={viewport} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r bg-background">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium">Chat with Motif</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Describe a campaign and watch it build itself on the canvas. The
              agent arrives with the next milestone (M2).
            </p>
          </div>
        </aside>
        <CanvasStage ctrl={ctrl} backend={backend} onViewport={setViewport} />
        <InspectorTabs ctrl={ctrl} />
      </div>
    </div>
  )
}
