// Undo/redo — a ring buffer of patch pairs. One dispatch transaction = one
// entry ("Applied 6 edits · Undo" is entry-granular, not command-granular).
// Entries carry the full patch set over { document, selection }, so undo
// restores what was selected as well as what the document said.

import type { Patch } from "immer"
import type { CommandSource } from "./types"

export interface HistoryEntry {
  label: string
  source: CommandSource
  commandIds: string[]
  patches: Patch[]
  inversePatches: Patch[]
  /** Monotonic sequence — the ToolCallChip uses it to know if its entry is
   *  still the top of the stack (undoable in place) or superseded. */
  seq: number
}

const CAP = 200

export class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private seq = 0

  push(entry: Omit<HistoryEntry, "seq">): HistoryEntry {
    const full = { ...entry, seq: ++this.seq }
    this.past.push(full)
    if (this.past.length > CAP) this.past.shift()
    this.future = []
    return full
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
  /** The entry undo would revert (top of the stack). */
  get top(): HistoryEntry | null {
    return this.past[this.past.length - 1] ?? null
  }

  undo(): HistoryEntry | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(entry)
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return entry
  }

  /** Entries newer than `seq` — how the agent learns what the human changed
   *  since its last turn (docs/plan/03-agent-first.md diff results). */
  since(seq: number): HistoryEntry[] {
    return this.past.filter((e) => e.seq > seq)
  }

  get lastSeq(): number {
    return this.seq
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
