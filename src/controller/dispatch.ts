// dispatch — the ONLY mutator of the document. A batch of commands becomes
// exactly one immer transaction and one history entry:
//
//   validate all (zod) → apply all in one produceWithPatches → push history
//
// Repairable issues apply with warnings; unknown commands, schema failures,
// and unresolvable ids abort the WHOLE batch (nothing applies). The agent's
// motif_edit tool call and a UI slider drag arrive here identically.

import type { Patch } from "immer"
import type { Box } from "../engine/backend"
import type { DocumentStore } from "./store"
import type { History, HistoryEntry } from "./history"
import type { AnyCommandDef, CommandSource, Invalidation } from "./types"
import { CommandAbort, commandById, maxInvalidation } from "./types"

export interface CommandCall {
  command: string
  args?: Record<string, unknown>
}

export interface DispatchOptions {
  label?: string
  source?: CommandSource
}

export interface DispatchResult {
  ok: boolean
  /** Commands applied (0 on abort). */
  applied: number
  /** Per-command return values (created ids etc.), in call order. */
  returns: unknown[]
  /** Normalize-gate repair report. */
  warnings: string[]
  /** Abort reasons (batch did not apply). */
  errors: string[]
  /** The strongest engine invalidation across applied commands. */
  invalidation: Invalidation
  /** The history entry (null for selection-only or aborted batches). */
  entry: HistoryEntry | null
}

interface Gesture {
  label: string
  source: CommandSource
  commandIds: string[]
  patches: Patch[]
  inversePatches: Patch[]
}

export class Dispatcher {
  private gesture: Gesture | null = null

  constructor(
    private store: DocumentStore,
    private history: History,
    /** Live measurement pass-through (null headless — commands fall back to
     *  normalized-layout estimates). */
    private measure: (id: string) => Box | null = () => null
  ) {}

  /** Begin coalescing: every dispatch until endGesture() accumulates into ONE
   *  history entry (a drag is one undo step, not sixty). */
  beginGesture(label: string, source: CommandSource = "user"): void {
    this.endGesture()
    this.gesture = {
      label,
      source,
      commandIds: [],
      patches: [],
      inversePatches: [],
    }
  }

  endGesture(): HistoryEntry | null {
    const g = this.gesture
    this.gesture = null
    if (!g || !g.patches.length) return null
    return this.history.push({
      label: g.label,
      source: g.source,
      commandIds: [...new Set(g.commandIds)],
      patches: g.patches,
      // inverse patches must unwind in reverse application order
      inversePatches: [...g.inversePatches].reverse(),
    })
  }

  dispatch(
    calls: CommandCall[] | CommandCall,
    opts: DispatchOptions = {}
  ): DispatchResult {
    const batch = Array.isArray(calls) ? calls : [calls]
    const source = opts.source ?? "user"
    const warnings: string[] = []
    const warn = (msg: string) => warnings.push(msg)

    // --- validate all ------------------------------------------------------
    const resolved: Array<{ def: AnyCommandDef; args: unknown }> = []
    for (const call of batch) {
      const def = commandById(call.command)
      if (!def) {
        return failure([`unknown command "${call.command}"`], warnings)
      }
      const parsed = def.schema.safeParse(call.args ?? {})
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")
        return failure([`${call.command}: invalid args — ${detail}`], warnings)
      }
      resolved.push({ def, args: parsed.data })
    }
    if (!resolved.length) {
      return failure(["empty command batch"], warnings)
    }

    // --- apply all in one transaction ---------------------------------------
    const returns: unknown[] = []
    let invalidation: Invalidation = "none"
    try {
      const ctx = { warn, measure: this.measure }
      const { patches, inversePatches } = this.store.transact((draft) => {
        for (const { def, args } of resolved) {
          returns.push(def.apply(draft, args, ctx))
          invalidation = maxInvalidation(invalidation, def.invalidates)
        }
      })

      // Selection-only changes are not undoable steps.
      const touchesDocument = patches.some((p) => p.path[0] === "document")
      let entry: HistoryEntry | null = null
      if (touchesDocument && this.gesture) {
        this.gesture.commandIds.push(...resolved.map((r) => r.def.id))
        this.gesture.patches.push(...patches)
        this.gesture.inversePatches.push(...inversePatches)
      } else if (touchesDocument) {
        entry = this.history.push({
          label: opts.label ?? defaultLabel(resolved.map((r) => r.def)),
          source,
          commandIds: resolved.map((r) => r.def.id),
          patches,
          inversePatches,
        })
      }

      return {
        ok: true,
        applied: resolved.length,
        returns,
        warnings,
        errors: [],
        invalidation,
        entry,
      }
    } catch (e) {
      if (e instanceof CommandAbort) return failure([e.message], warnings)
      throw e
    }
  }
}

function failure(errors: string[], warnings: string[]): DispatchResult {
  return {
    ok: false,
    applied: 0,
    returns: [],
    warnings,
    errors,
    invalidation: "none",
    entry: null,
  }
}

function defaultLabel(defs: AnyCommandDef[]): string {
  if (defs.length === 1) return defs[0].title
  const groups = [...new Set(defs.map((d) => d.group))]
  return `${defs.length} edits (${groups.join(", ")})`
}
