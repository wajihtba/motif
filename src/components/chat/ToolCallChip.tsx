// One agent tool call in the transcript. While streaming: spinner + live
// label ("Building the scene… 4 elements"). Applied: the "Applied N edits ·
// Undo" pill — Undo works in place while this entry is still the top of the
// history stack; superseded entries point at ⌘Z instead
// (docs/plan/00-product.md "agent-first, concretely").

import type { ChatStore, ChatToolItem } from "@/agent/chat"
import type { EditorController } from "@/controller"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEditorState } from "@/hooks/use-document-store"

export function ToolCallChip({
  item,
  ctrl,
  chat,
}: {
  item: ChatToolItem
  ctrl: EditorController
  chat: ChatStore
}) {
  // Subscribe to the document store so top-of-stack state stays live.
  useEditorState(ctrl)
  const isTop =
    item.historySeq != null && ctrl.history.top?.seq === item.historySeq
  const undoable = item.state === "applied" && item.historySeq != null

  const undo = () => {
    if (item.undone) {
      const entry = ctrl.redo()
      if (entry) chat.markUndone(entry.seq, false)
    } else if (isTop) {
      const entry = ctrl.undo()
      if (entry) chat.markUndone(entry.seq, true)
    }
  }

  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${
        item.state === "error"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2">
        {item.state === "running" ? (
          <Spinner className="size-3.5 text-primary" />
        ) : (
          <span
            className={`size-2 rounded-full ${
              item.state === "error" ? "bg-destructive" : "bg-primary"
            }`}
          />
        )}
        <span
          className={`flex-1 text-xs font-medium ${item.undone ? "text-muted-foreground line-through" : ""}`}
        >
          {item.label}
        </span>
        {undoable && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={!isTop && !item.undone}
                    onClick={undo}
                  >
                    {item.undone ? "Redo" : "Undo"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isTop && !item.undone && (
                <TooltipContent>
                  Superseded by later edits — use ⌘Z to step back
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {item.warnings.length > 0 && (
        <ul className="space-y-0.5 pl-4 text-[11px] text-amber-500/90">
          {item.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {item.error && (
        <p className="text-[11px] text-destructive">{item.error}</p>
      )}
    </div>
  )
}
