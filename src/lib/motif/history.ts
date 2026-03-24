// ── M.history — Undo/Redo ──
// Snapshots: innerHTML of all slides + meta + selection

import { bus } from "./bus"
import { interaction } from "./interaction"
import { kernel } from "./kernel"
import { meta } from "./meta"
import { store } from "./store"
import type { HistorySnapshot } from "./types"

const MAX_HISTORY = 50

class History {
  private _stack: HistorySnapshot[] = []
  private _index = -1
  private _paused = false

  init() {
    bus.on("node:added", () => this.push())
    bus.on("node:removed", () => this.push())
    bus.on("node:mutated", () => this.push())
    bus.on("history:undo", () => this.undo())
    bus.on("history:redo", () => this.redo())
  }

  push() {
    if (this._paused) return

    const snapshot = this._capture()

    this._stack = this._stack.slice(0, this._index + 1)
    this._stack.push(snapshot)

    if (this._stack.length > MAX_HISTORY) {
      this._stack.shift()
    }
    this._index = this._stack.length - 1
  }

  undo() {
    if (this._index <= 0) return
    this._index--
    this._restore(this._stack[this._index])
  }

  redo() {
    if (this._index >= this._stack.length - 1) return
    this._index++
    this._restore(this._stack[this._index])
  }

  get canUndo() {
    return this._index > 0
  }

  get canRedo() {
    return this._index < this._stack.length - 1
  }

  private _capture(): HistorySnapshot {
    return {
      slides: store.slides.map((s) => ({
        id: s.id,
        html: kernel.snapshotSlide(s.id),
        name: s.name,
      })),
      meta: meta.serialize(),
      activeSlideId: store.activeId,
      selectedId: interaction.selectedId,
    }
  }

  private _restore(snap: HistorySnapshot) {
    this._paused = true

    for (const s of snap.slides) {
      kernel.restoreSlide(s.id, s.html)
    }

    meta.deserialize(snap.meta)

    if (snap.activeSlideId) store.switchSlide(snap.activeSlideId)
    interaction.select(snap.selectedId)

    this._paused = false
    bus.emit("history:restored")
  }
}

export const history = new History()
