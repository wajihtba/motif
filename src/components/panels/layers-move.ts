// Pure drag-and-drop math for the layers tree, factored out of LayersPanel so
// the fiddly same-parent index adjustment is unit-testable without a DOM.
//
// A drop resolves to a parent + insertion index expressed in element.move's
// terms: move() removes the node first, THEN inserts, so a downward move within
// one parent must aim one slot earlier than the raw target position.

import type { Scene } from "@/scene/types"
import { findNode, findParent } from "@/scene/model"

export type DropPos = "before" | "after" | "inside"

export interface DropTarget {
  id: string
  pos: DropPos
}

export interface LayerMove {
  parentId: string
  index: number
}

/** Resolve a drop of `movingId` onto `target` to element.move arguments, or
 *  null when the move is a no-op (dropping a node onto itself). Cycle safety
 *  (dropping into a descendant) is enforced by moveNode, so it's not re-checked
 *  here. */
export function computeLayerMove(
  scene: Scene,
  movingId: string,
  target: DropTarget
): LayerMove | null {
  if (movingId === target.id) return null

  if (target.pos === "inside") {
    const node = findNode(scene, target.id)
    return { parentId: target.id, index: node?.children?.length ?? 0 }
  }

  const parent = findParent(scene, target.id) ?? scene.root
  const siblings = parent.children ?? []
  const at = siblings.findIndex((c) => c.id === target.id)
  let index = target.pos === "before" ? at : at + 1
  const from = siblings.findIndex((c) => c.id === movingId)
  if (from !== -1 && from < index) index -= 1
  return { parentId: parent.id, index }
}
