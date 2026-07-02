// The document store — immer produceWithPatches over { document, selection }.
// Chosen over a state library because the transaction IS the product
// (docs/plan/01-architecture.md §7): every dispatch yields patches +
// inversePatches that drive undo/redo, the engine's incremental DOM patcher,
// and the agent's diff-based tool results. React consumes snapshots through
// a ~15-line useSyncExternalStore adapter (src/hooks/use-document-store.ts).

import type { Patch } from "immer"
import { applyPatches, enablePatches, produceWithPatches } from "immer"
import type { Document } from "../scene/types"
import type { EditorState } from "./types"
import { emptyDocument } from "../scene/model"

enablePatches()

export interface Transaction {
  state: EditorState
  patches: Patch[]
  inversePatches: Patch[]
}

export class DocumentStore {
  private current: EditorState
  private listeners = new Set<() => void>()
  version = 0

  constructor(document?: Document) {
    this.current = { document: document ?? emptyDocument(), selection: [] }
  }

  get state(): EditorState {
    return this.current
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.version += 1
    for (const fn of this.listeners) fn()
  }

  /** Run one mutation transaction. Throwing inside `recipe` aborts cleanly —
   *  the state is untouched and the error propagates to the dispatcher. */
  transact(recipe: (draft: EditorState) => void): Transaction {
    const [next, patches, inversePatches] = produceWithPatches(
      this.current,
      recipe
    )
    if (patches.length) {
      this.current = next
      this.emit()
    }
    return { state: this.current, patches, inversePatches }
  }

  /** Apply recorded patches (undo/redo path — bypasses commands by design;
   *  history entries are the only callers). */
  applyRaw(patches: Patch[]): void {
    if (!patches.length) return
    this.current = applyPatches(this.current, patches)
    this.emit()
  }

  /** Replace the whole document (project load / import). */
  load(document: Document): void {
    this.current = { document, selection: [] }
    this.emit()
  }
}
