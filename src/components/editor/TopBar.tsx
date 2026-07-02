// Editor top bar: wordmark/home, inline-renamable document name, undo/redo,
// zoom controls, export (arrives M5). Every action dispatches commands —
// the same seam the agent uses.

import { useEffect, useState } from "react"
import type { EditorController } from "@/controller"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEditorState } from "@/hooks/use-document-store"

export interface TopBarViewport {
  zoom: number
  zoomBy: (f: number) => void
  fit: () => void
  reset: () => void
}

export function TopBar({
  ctrl,
  viewport,
}: {
  ctrl: EditorController
  viewport: TopBarViewport | null
}) {
  const state = useEditorState(ctrl)
  const [editingName, setEditingName] = useState(false)
  // history has no store subscription — derive on each render (cheap) and
  // re-render is guaranteed because every undoable change also bumps the store
  const canUndo = ctrl.history.canUndo
  const canRedo = ctrl.history.canRedo

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) ctrl.redo()
        else ctrl.undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ctrl])

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3">
        <span className="text-sm font-bold tracking-wide select-none">
          Motif
        </span>
        <div className="h-5 w-px bg-border" />
        {editingName ? (
          <Input
            autoFocus
            defaultValue={state.document.name}
            className="h-7 w-48 text-sm"
            onBlur={(e) => {
              setEditingName(false)
              const name = e.target.value.trim()
              if (name && name !== state.document.name) {
                ctrl.dispatch({ command: "doc.rename", args: { name } })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              if (e.key === "Escape") setEditingName(false)
            }}
          />
        ) : (
          <button
            className="rounded px-1.5 py-0.5 text-sm text-foreground/90 hover:bg-muted"
            onClick={() => setEditingName(true)}
          >
            {state.document.name}
          </button>
        )}
        <Badge variant="outline" className="text-xs text-muted-foreground">
          {state.document.scene.baseWidth}×{state.document.scene.baseHeight} ·{" "}
          {state.document.scene.format}
        </Badge>

        <div className="flex-1" />

        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUndo}
                onClick={() => ctrl.undo()}
              >
                Undo
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Undo <Kbd>⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canRedo}
                onClick={() => ctrl.redo()}
              >
                Redo
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Redo <Kbd>⌘⇧Z</Kbd>
            </TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={() => viewport?.zoomBy(1 / 1.2)}
          >
            −
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-16 tabular-nums"
            onClick={() => viewport?.fit()}
          >
            {viewport ? `${Math.round(viewport.zoom * 100)}%` : "…"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => viewport?.zoomBy(1.2)}
          >
            +
          </Button>
        </ButtonGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" disabled>
                Export
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>PNG/video export lands with M5</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  )
}
