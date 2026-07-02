// dom-patch — the SINGLE DOM writer after mount. Store patches from a
// dispatch transaction are classified into minimal DOM operations against
// both DOM copies the engine owns (the measurement host's nested tree and
// the canvas's flat unit list). Nothing else may touch those trees: one
// writer is the invariant that keeps undo/redo and the DOM in lockstep
// (docs/plan/04-milestones-risks.md risk #8).
//
// Operation ladder (cheapest that is correct):
//   restyle      re-apply one node's compiled style in place
//   rebuild      rebuild one node's subtree and swap it in
//   recompile    re-run the unit split (unit-root set changed)
//   remount      full setScene (scene replaced / base size changed)

import type { EnginePatch } from "../backend"
import type { Scene, SceneNode } from "../../scene/types"
import { findNode } from "../../scene/model"
import { applyNodeStyle } from "./build"

/** What a transaction's patches touch, resolved to node ids. */
export interface PatchTargets {
  /** css/layout/hidden changed — restyle in place. */
  restyle: Set<string>
  /** html/image/tag/children changed — rebuild that node's subtree. */
  rebuild: Set<string>
  /** theme/background/stylesheet changed. */
  sceneStyle: boolean
  /** effects/animations arrays changed (unit split may differ). */
  stack: boolean
  /** root swapped or base size/format changed — remount. */
  remount: boolean
}

const NODE_STYLE_FIELDS = new Set(["css", "layout", "hidden", "locked"])
const NODE_CONTENT_FIELDS = new Set([
  "html",
  "image",
  "imageFit",
  "tag",
  "editable",
])
const SCENE_STYLE_FIELDS = new Set(["theme", "background", "stylesheet"])
const REMOUNT_FIELDS = new Set(["baseWidth", "baseHeight", "format"])

/** Classify a transaction's patches. Paths look like
 *  ['document','scene','root','children',0,'css','color']. */
export function classifyPatches(
  scene: Scene,
  patches: EnginePatch[]
): PatchTargets {
  const out: PatchTargets = {
    restyle: new Set(),
    rebuild: new Set(),
    sceneStyle: false,
    stack: false,
    remount: false,
  }
  for (const patch of patches) {
    const [head, second, ...rel] = patch.path
    if (head !== "document") continue // selection — no DOM effect
    if (second !== "scene") continue // brief/name — no DOM effect
    if (rel.length === 0) {
      out.remount = true // whole scene replaced
      continue
    }
    const top = rel[0]
    if (top === "root") {
      classifyNodePath(scene, rel, out)
    } else if (SCENE_STYLE_FIELDS.has(String(top))) {
      out.sceneStyle = true
    } else if (top === "effects" || top === "animations") {
      out.stack = true
    } else if (REMOUNT_FIELDS.has(String(top))) {
      out.remount = true
    } else if (top === "timeline") {
      // playback-only; no DOM effect
    } else {
      out.remount = true // unknown scene field — be conservative
    }
  }
  return out
}

/** Walk ['root','children',i,…] against the NEW scene to find the deepest
 *  existing node and the field the patch lands on. */
function classifyNodePath(
  scene: Scene,
  rel: Array<string | number>,
  out: PatchTargets
): void {
  if (rel.length === 1) {
    out.remount = true // root object replaced wholesale
    return
  }
  let node: SceneNode = scene.root
  let i = 1
  while (i < rel.length) {
    const seg = rel[i]
    if (seg === "children") {
      const idx = rel[i + 1]
      if (typeof idx !== "number") {
        // children array itself replaced → rebuild this node
        out.rebuild.add(node.id)
        return
      }
      const child = node.children?.[idx]
      if (!child || i + 2 >= rel.length) {
        // add/remove/replace of a whole child → rebuild the parent
        out.rebuild.add(node.id)
        return
      }
      node = child
      i += 2
      continue
    }
    // A field on `node`.
    const field = String(seg)
    if (NODE_STYLE_FIELDS.has(field)) out.restyle.add(node.id)
    else if (NODE_CONTENT_FIELDS.has(field)) out.rebuild.add(node.id)
    // role/locked etc: no visual op
    return
  }
  // Path ended exactly on a node → replaced object → rebuild parent side
  out.rebuild.add(node.id)
}

/** Apply a restyle to a node's element in one DOM copy. Unit-root elements
 *  carry pinned overrides (position 0,0 + measured px size) that must
 *  survive the restyle — the caller re-pins via `pin`. */
export function restyleEl(
  el: HTMLElement,
  node: SceneNode,
  pin?: (el: HTMLElement) => void
): void {
  applyNodeStyle(el, node)
  pin?.(el)
}

/** Resolve the up-to-date SceneNode for an id (post-transaction scene). */
export function nodeForId(scene: Scene, id: string): SceneNode | null {
  return id === scene.root.id ? scene.root : (findNode(scene, id) ?? null)
}
