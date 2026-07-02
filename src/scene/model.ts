// Scene tree helpers — creation, traversal, and structural mutation. The
// document is a tree (root + children), so the agent and UI can create /
// delete / nest / reparent nodes. All lookups are by stable id; never by
// index/DOM position. Pure functions over plain data — the controller (M1)
// wraps these in immer transactions; the engine only reads.

import type { Layout } from "./layout"
import type {
  Brief,
  Document,
  ElementRole,
  Project,
  Scene,
  SceneNode,
} from "./types"
import { defaultLayout } from "./layout"
import { DEFAULT_THEME } from "./theme"

let counter = 0
export function uid(prefix = "el"): string {
  counter += 1
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 6)}`
}

/** Build a node, defaulting everything an agent might omit. */
export function node(partial: Partial<SceneNode> = {}): SceneNode {
  return {
    id: partial.id ?? uid(),
    role: partial.role,
    tag: partial.tag,
    html: partial.html,
    children: partial.children,
    image: partial.image,
    imageFit: partial.imageFit,
    layout: partial.layout ?? defaultLayout(),
    css: partial.css ?? {},
    editable: partial.editable,
    hidden: partial.hidden,
    locked: partial.locked,
  }
}

/** A full-canvas root container that all top-level nodes anchor to. */
export function rootNode(children: SceneNode[] = []): SceneNode {
  return node({
    id: "root",
    role: "group",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0,
      dy: 0,
      width: 1,
      height: 1,
    },
    children,
  })
}

export function emptyScene(
  baseWidth = 1080,
  baseHeight = 1080,
  format = "ig-post"
): Scene {
  return {
    baseWidth,
    baseHeight,
    format,
    background: "var(--background)",
    theme: structuredClone(DEFAULT_THEME),
    root: rootNode(),
    animations: [],
    effects: [],
    timeline: { duration: 5, fps: 30 },
  }
}

export function emptyBrief(): Brief {
  return {}
}

export function emptyDocument(name = "Untitled"): Document {
  return {
    id: uid("doc"),
    name,
    brief: emptyBrief(),
    scene: emptyScene(),
    formats: [],
  }
}

export function emptyProject(name = "Untitled project", now = 0): Project {
  return {
    id: uid("proj"),
    name,
    documents: [emptyDocument()],
    createdAt: now,
    updatedAt: now,
  }
}

// --- traversal --------------------------------------------------------------

/** Depth-first walk over the tree (root included). Return false from `fn` to
 *  skip a node's subtree. */
export function walk(
  root: SceneNode,
  fn: (n: SceneNode, parent: SceneNode | null) => void | false
) {
  const visit = (n: SceneNode, parent: SceneNode | null) => {
    if (fn(n, parent) === false) return
    for (const c of n.children ?? []) visit(c, n)
  }
  visit(root, null)
}

/** All nodes in DFS order, excluding the root container. */
export function flatten(root: SceneNode): SceneNode[] {
  const out: SceneNode[] = []
  walk(root, (n) => {
    if (n.id !== root.id) out.push(n)
  })
  return out
}

export function findNode(scene: Scene, id: string): SceneNode | undefined {
  let found: SceneNode | undefined
  walk(scene.root, (n) => {
    if (n.id === id) {
      found = n
      return false
    }
  })
  return found
}

export function findParent(scene: Scene, id: string): SceneNode | undefined {
  let parent: SceneNode | undefined
  walk(scene.root, (n) => {
    if (n.children?.some((c) => c.id === id)) parent = n
  })
  return parent
}

export function nodesByRole(scene: Scene, role: ElementRole): SceneNode[] {
  return flatten(scene.root).filter((n) => n.role === role)
}

/** Resolve a list of ids to existing nodes (drops unknown ids). */
export function nodesByIds(scene: Scene, ids: string[]): SceneNode[] {
  const set = new Set(ids)
  return flatten(scene.root).filter((n) => set.has(n.id))
}

// --- structural mutation ----------------------------------------------------

/** Insert a node under `parentId` (root if absent) at `index` (append if absent). */
export function insertNode(
  scene: Scene,
  child: SceneNode,
  parentId?: string,
  index?: number
) {
  const parent = parentId ? findNode(scene, parentId) : scene.root
  if (!parent) return
  parent.children ??= []
  const i =
    index == null
      ? parent.children.length
      : Math.max(0, Math.min(index, parent.children.length))
  parent.children.splice(i, 0, child)
}

/** Remove a node (and its subtree) by id. Returns the removed node. */
export function removeNode(scene: Scene, id: string): SceneNode | undefined {
  const parent = findParent(scene, id)
  if (!parent?.children) return undefined
  const i = parent.children.findIndex((c) => c.id === id)
  if (i === -1) return undefined
  return parent.children.splice(i, 1)[0]
}

/** Reparent / reorder a node. No-op if it would create a cycle. */
export function moveNode(
  scene: Scene,
  id: string,
  parentId: string,
  index?: number
) {
  if (id === parentId || isAncestor(scene, id, parentId)) return
  const moved = removeNode(scene, id)
  if (!moved) return
  insertNode(scene, moved, parentId, index)
}

/** True if `maybeAncestorId` is an ancestor of `id` (so moving id under it loops). */
export function isAncestor(
  scene: Scene,
  maybeAncestorId: string,
  id: string
): boolean {
  const anc = findNode(scene, maybeAncestorId)
  if (!anc) return false
  let hit = false
  walk(anc, (n) => {
    if (n.id === id) hit = true
  })
  return hit
}

/** Reorder a node among its siblings (z-order within the same parent). */
export function reorderSibling(
  scene: Scene,
  id: string,
  dir: "forward" | "backward" | "front" | "back"
) {
  const parent = findParent(scene, id)
  if (!parent?.children) return
  const arr = parent.children
  const i = arr.findIndex((c) => c.id === id)
  if (i === -1) return
  const [n] = arr.splice(i, 1)
  if (dir === "front") arr.push(n)
  else if (dir === "back") arr.unshift(n)
  else if (dir === "forward") arr.splice(Math.min(arr.length, i + 1), 0, n)
  else arr.splice(Math.max(0, i - 1), 0, n)
}

export type { Layout }
