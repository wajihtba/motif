// Hover-to-preview for the effect browser: paint the hovered catalogue effect
// onto the LIVE canvas so you see exactly what clicking would apply — without
// touching the document store (no history entry, no autosave, no dirty state).
// The preview scene is derived (real scene + one candidate layer, normalized
// through the same gate fx.add uses) and pushed straight to the renderer; the
// synthetic effects-array patch takes the backend's cheap stack-only path.
// Leaving the item — or unmounting the grid — pushes the real scene back.

import { useEffect, useRef } from "react"
import type { EditorController } from "@/controller"
import type { AnyEffectDef } from "@/effects/core/types"
import type { EnginePatch } from "@/engine/backend"
import { normalizeLayer } from "@/controller/normalize"

/** Long enough to skip items swept over on the way to another, short enough
 *  to feel immediate on the one you settle on. */
const HOVER_DELAY_MS = 100

export function useFxHoverPreview(ctrl: EditorController) {
  const timer = useRef<number | null>(null)
  const active = useRef(false)

  /** Render real scene + `def` (or just the real scene when def is null). */
  const push = (def: AnyEffectDef | null) => {
    const backend = ctrl.backendRef
    if (!backend) return
    const scene = ctrl.store.state.document.scene
    let effects = scene.effects
    if (def && def.kind !== "anim") {
      const selection = ctrl.store.state.selection
      const target = selection.length
        ? { type: "elements" as const, ids: [...selection] }
        : { type: "canvas" as const }
      let layer
      try {
        layer = normalizeLayer(
          { effect: def.id, kind: def.kind },
          target,
          undefined,
          scene
        )
      } catch {
        return // role policy rejects every target — nothing to preview
      }
      if (!layer) return
      effects = [...scene.effects, layer]
    }
    const preview = def ? { ...scene, effects } : scene
    const patch: EnginePatch = {
      op: "replace",
      path: ["document", "scene", "effects"],
      value: effects,
    }
    if (backend.applyTransaction) backend.applyTransaction(preview, [patch])
    else backend.setScene(preview)
  }

  const stopTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const enter = (def: AnyEffectDef) => {
    stopTimer()
    timer.current = window.setTimeout(() => {
      timer.current = null
      active.current = true
      push(def)
    }, HOVER_DELAY_MS)
  }

  const leave = () => {
    stopTimer()
    if (active.current) {
      active.current = false
      push(null)
    }
  }

  /** On click-to-apply: forget the preview WITHOUT repainting — the fx.add
   *  dispatch is about to sync the real scene (now containing the effect),
   *  and a restore first would flash the un-effected frame. */
  const commit = () => {
    stopTimer()
    active.current = false
  }

  // Grid unmount (panel closed, tab switched) must never strand a preview.
  useEffect(() => leave, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { enter, leave, commit }
}
