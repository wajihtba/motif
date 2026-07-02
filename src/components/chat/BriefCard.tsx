// The brief card — the agent's durable memory made VISIBLE
// (docs/plan/03-agent-first.md §7). Pinned above the composer; collapsible;
// inline-editable (edits dispatch brief.update, the same command the agent
// uses, so both parties share one source of truth).

import { useState } from "react"
import type { EditorController } from "@/controller"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Textarea } from "@/components/ui/textarea"
import { useEditorState } from "@/hooks/use-document-store"

export function BriefCard({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const brief = state.document.brief
  const [open, setOpen] = useState(false)

  const lines = [
    brief.goal && `Goal — ${brief.goal}`,
    brief.audience && `Audience — ${brief.audience}`,
    brief.tone && `Tone — ${brief.tone}`,
    brief.mustInclude?.length &&
      `Must include — ${brief.mustInclude.join(", ")}`,
    brief.notes,
  ].filter(Boolean) as string[]

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-muted/30"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Brief
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {lines[0] ?? "Nothing yet — the agent keeps it as you talk"}
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-2">
        {lines.slice(open ? 0 : 1).map((l, i) => (
          <p key={i} className="text-xs leading-relaxed text-foreground/80">
            {l}
          </p>
        ))}
        <EditNotes ctrl={ctrl} notes={brief.notes ?? ""} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function EditNotes({ ctrl, notes }: { ctrl: EditorController; notes: string }) {
  const [draft, setDraft] = useState(notes)
  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== notes) {
          ctrl.dispatch({
            command: "brief.update",
            args: { brief: { notes: draft } },
          })
        }
      }}
      placeholder="Add notes the agent should always respect…"
      className="min-h-14 text-xs"
    />
  )
}
