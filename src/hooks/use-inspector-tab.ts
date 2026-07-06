// Tiny cross-panel store for the right inspector's active tab, so other
// panels (e.g. the layers tree's fx badge) can jump straight to a tab.
// Ephemeral UI state — deliberately outside the document store/undo history,
// same spirit as use-hover's HoverStore.

import { useSyncExternalStore } from "react"

export type InspectorTab = "design" | "effects" | "animate"

let current: InspectorTab = "design"
const listeners = new Set<() => void>()

export function setInspectorTab(tab: InspectorTab): void {
  if (tab === current) return
  current = tab
  listeners.forEach((fn) => fn())
}

export function useInspectorTab(): InspectorTab {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current
  )
}
