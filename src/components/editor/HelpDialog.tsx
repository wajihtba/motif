// ⌘/ — the shortcut reference. One static table; anything listed here must
// actually be wired in EditorShell / Interaction / Timeline.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "General",
    rows: [
      ["⌘K", "Command palette"],
      ["⌘/", "This help"],
      ["⌘Z / ⌘⇧Z", "Undo / redo"],
      ["⌘S", "Save now (autosave runs anyway)"],
    ],
  },
  {
    title: "Canvas",
    rows: [
      ["Click / ⇧Click", "Select / multi-select"],
      ["Double-click", "Edit text in place"],
      ["Drag · corner handle", "Move · resize"],
      ["Arrows / ⇧Arrows", "Nudge 1px / 10px"],
      ["⌘D", "Duplicate selection"],
      ["⌫", "Delete selection"],
      ["Esc", "Deselect"],
      ["[ / ]", "Send backward / bring forward"],
      ["Space-drag · scroll", "Pan · zoom"],
    ],
  },
  {
    title: "Timeline & text editing",
    rows: [
      ["Space", "Play / pause"],
      ["Esc", "Cancel text edit"],
      ["⌘Enter", "Commit text edit"],
    ],
  },
]

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs">
            Everything here also lives in the ⌘K palette.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase">
                {g.title}
              </div>
              <div className="space-y-1">
                {g.rows.map(([keys, what]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between text-xs"
                  >
                    <span>{what}</span>
                    <Kbd>{keys}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
