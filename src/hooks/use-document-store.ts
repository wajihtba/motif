// The React side of the seam — the ONLY place React and the controller meet.
// Engine/controller code stays framework-free; React consumes immutable
// snapshots via useSyncExternalStore (immer structural sharing means
// unchanged subtrees keep identity, so memoized components skip re-renders).

import { useSyncExternalStore } from "react"
import type { EditorController, EditorState } from "@/controller"

export function useEditorState(ctrl: EditorController): EditorState {
  return useSyncExternalStore(
    (cb) => ctrl.store.subscribe(cb),
    () => ctrl.store.state,
    () => ctrl.store.state
  )
}
