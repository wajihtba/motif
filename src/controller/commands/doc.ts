// Document-level commands. `brief.update` is the agent's durable memory —
// creative intent that survives chat compaction, reload, and new
// conversations (docs/plan/03-agent-first.md §7).

import { z } from "zod"
import type { AnyCommandDef } from "../types"
import { zBrief } from "../schemas"
import { defineCommand } from "../types"

export const docCommands: AnyCommandDef[] = [
  defineCommand({
    id: "brief.update",
    title: "Update brief",
    group: "Document",
    description:
      "Merge fields into the durable creative brief (goal, audience, tone, mustInclude, notes). Set replace=true to overwrite.",
    schema: z.object({
      brief: zBrief,
      replace: z.boolean().optional(),
    }),
    invalidates: "none",
    apply: (draft, args) => {
      draft.document.brief = args.replace
        ? args.brief
        : { ...draft.document.brief, ...args.brief }
    },
  }),

  defineCommand({
    id: "doc.rename",
    title: "Rename document",
    group: "Document",
    description: "Rename this document.",
    schema: z.object({ name: z.string().min(1).max(120) }),
    invalidates: "none",
    apply: (draft, args) => {
      draft.document.name = args.name
    },
  }),
]
