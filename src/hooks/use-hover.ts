// Ephemeral cross-panel hover state. Deliberately kept OUT of the document
// store (hover is not part of the document, must not enter history, and
// changes on every pointer move) — but it still needs to be shared between the
// canvas and the layers panel so hovering a layer row highlights it on the
// artboard and vice-versa. Same external-store + useSyncExternalStore shape as
// DocumentStore, so only the components that read `hoverId` re-render on a
// hover change; the shell and its heavy siblings never do.

import { useSyncExternalStore } from "react"

export class HoverStore {
  private hoverId: string | null = null
  private listeners = new Set<() => void>()

  get(): string | null {
    return this.hoverId
  }

  setHover(id: string | null): void {
    if (id === this.hoverId) return
    this.hoverId = id
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export function useHoverId(store: HoverStore): string | null {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.get(),
    () => store.get()
  )
}
