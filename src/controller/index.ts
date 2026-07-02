// EditorController v2 — the headless editor brain. Owns the store, history,
// and dispatcher; bridges transactions to the renderer backend. Imports no
// React and no UI: the editor shell, the agent loop, and tests all drive it
// through the same three calls — dispatch / undo / redo.

import type { Patch } from "immer"
import type { RendererBackend } from "../engine/backend"
import type { Document } from "../scene/types"
import type { CommandCall, DispatchOptions, DispatchResult } from "./dispatch"
import type { DescribeOptions } from "./describe"
import type { HistoryEntry } from "./history"
import type { Invalidation } from "./types"
import { registerCoreCommands } from "./commands"
import { describe } from "./describe"
import { Dispatcher } from "./dispatch"
import { History } from "./history"
import { DocumentStore } from "./store"

export class EditorController {
  readonly store: DocumentStore
  readonly history = new History()
  private dispatcher: Dispatcher
  private backend: RendererBackend | null = null

  constructor(document?: Document) {
    registerCoreCommands()
    this.store = new DocumentStore(document)
    this.dispatcher = new Dispatcher(this.store, this.history)
  }

  /** The single mutation entry point (UI widgets and agent tool calls alike). */
  dispatch(
    calls: CommandCall[] | CommandCall,
    opts: DispatchOptions = {}
  ): DispatchResult {
    const result = this.dispatcher.dispatch(calls, opts)
    if (result.ok) {
      this.syncEngine(result.invalidation, result.entry?.patches ?? [])
    }
    return result
  }

  /** Coalesce every dispatch until endGesture() into one undo step (drags,
   *  slider scrubs). The engine still updates live per dispatch. */
  beginGesture(label: string): void {
    this.dispatcher.beginGesture(label)
  }

  endGesture(): HistoryEntry | null {
    const entry = this.dispatcher.endGesture()
    // canUndo lives outside the state object — wake subscribers explicitly.
    if (entry) this.store.notify()
    return entry
  }

  /** Convenience for UI selection (routes through element.select). */
  select(ids: string[] | string | null): void {
    this.dispatch(
      { command: "element.select", args: { ids } },
      { source: "user" }
    )
  }

  undo(): HistoryEntry | null {
    const entry = this.history.undo()
    if (entry) {
      this.store.applyRaw(entry.inversePatches)
      this.syncEngine("scene", entry.inversePatches)
    }
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.history.redo()
    if (entry) {
      this.store.applyRaw(entry.patches)
      this.syncEngine("scene", entry.patches)
    }
    return entry
  }

  describe(opts: DescribeOptions): string {
    return describe(this.store.state, {
      ...opts,
      measure: opts.measure ?? this.backend?.measure.bind(this.backend),
    })
  }

  /** Attach the renderer. The controller stays fully functional headless
   *  (tests, SSR) — the backend is an observer of transactions, never a
   *  source of truth. */
  attachBackend(backend: RendererBackend): void {
    this.backend = backend
    backend.setScene(this.store.state.document.scene)
  }

  detachBackend(): void {
    this.backend = null
  }

  get backendRef(): RendererBackend | null {
    return this.backend
  }

  load(document: Document): void {
    this.store.load(document)
    this.history.clear()
    this.syncEngine("scene", [])
  }

  /** Push a transaction's effect to the renderer: incremental via the
   *  dom-patch classifier when the backend supports it, remount otherwise.
   *  `invalidation` gates the no-op case; the classifier re-derives the
   *  per-node detail from the patches themselves (one source of truth). */
  private syncEngine(invalidation: Invalidation, patches: Patch[]): void {
    if (!this.backend || invalidation === "none") return
    const scene = this.store.state.document.scene
    if (this.backend.applyTransaction && patches.length) {
      this.backend.applyTransaction(scene, patches)
    } else {
      this.backend.setScene(scene)
    }
  }
}

export type { CommandCall, DispatchOptions, DispatchResult } from "./dispatch"
export type { DescribeLevel, DescribeOptions } from "./describe"
export type {
  AnyCommandDef,
  CommandSource,
  EditorState,
  Invalidation,
} from "./types"
export { allCommands, CommandAbort } from "./types"
export type { HistoryEntry } from "./history"
