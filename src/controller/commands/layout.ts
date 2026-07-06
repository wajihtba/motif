// Layout commands — assistive geometry over the normalized layout model.
// stackify is the repair move for the most common agent mistake: sibling
// content placed as individually-absolute boxes that collide once text wraps.
// Wrapping them into one flex stack makes the browser own the spacing.
// align/distribute nudge siblings by translating their normalized offsets, so
// anchors, sizes, and stack configs survive the move. Geometry prefers LIVE
// measured boxes (ctx.measure — real auto sizes) and falls back to
// normalized-layout estimates headless; the browser owns the real layout and
// the lint re-checks the result.

import { z } from "zod"
import type { AnyCommandDef, EditorState } from "../types"
import type { Scene, SceneNode } from "../../scene/types"
import type { Layout } from "../../scene/layout"
import { boxToLayout, layoutToBox } from "../../scene/layout"
import {
  findParent,
  insertNode,
  moveNode,
  node as makeNode,
  uid,
} from "../../scene/model"
import { resolveNodeId } from "../normalize"
import { CommandAbort, defineCommand } from "../types"

const scene = (draft: EditorState): Scene => draft.document.scene

export const layoutCommands: AnyCommandDef[] = [
  defineCommand({
    id: "layout.stackify",
    title: "Stackify siblings",
    group: "Element",
    description:
      "Wrap sibling nodes into a new column/row stack (children become flow), ordered by current position — fixes overlapping absolute siblings. Returns the new group id.",
    schema: z.object({
      ids: z.array(z.string()).min(2),
      direction: z.enum(["column", "row"]).default("column"),
      gap: z.number().min(0).default(24),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn, measure }) => {
      const s = scene(draft)
      const { parent, cw, ch, items } = resolveSiblings(
        s,
        args.ids,
        draft.selection,
        warn,
        measure
      )
      const boxes = items
        .map((i) => i.box)
        .filter((b): b is NonNullable<typeof b> => !!b)
      if (!boxes.length) {
        throw new CommandAbort(
          "stackify needs at least one positioned (absolute) sibling to place the stack"
        )
      }
      const axis = args.direction === "column" ? "y" : "x"
      items.sort((a, b) => {
        const av = a.box ? a.box[axis] : Infinity
        const bv = b.box ? b.box[axis] : Infinity
        return av === bv ? a.index - b.index : av - bv
      })

      const x0 = Math.min(...boxes.map((b) => b.x))
      const y0 = Math.min(...boxes.map((b) => b.y))
      const x1 = Math.max(...boxes.map((b) => b.x + b.w))
      const y1 = Math.max(...boxes.map((b) => b.y + b.h))
      const place = boxToLayout(x0, y0, x1 - x0, y1 - y0, cw, ch, "center")
      const layout: Layout = {
        mode: "stack",
        direction: args.direction,
        gap: args.gap,
        align: "center",
        justify: "start",
        anchor: "center",
        dx: place.dx,
        dy: place.dy,
        width: args.direction === "column" ? place.width : "auto",
        height: args.direction === "column" ? "auto" : place.height,
      }

      const group = makeNode({ id: uid("stack"), role: "group", layout })
      const insertAt = Math.min(...items.map((i) => i.index))
      insertNode(s, group, parent.id, insertAt)
      for (const { n } of items) {
        moveNode(s, n.id, group.id)
        if (n.layout.mode === "stack") {
          // A nested stack keeps its own flex config — only its anchor
          // positioning goes; unanchored stacks flow in the parent.
          const flowStack = { ...n.layout }
          delete flowStack.anchor
          delete flowStack.dx
          delete flowStack.dy
          n.layout = flowStack
        } else {
          n.layout = { mode: "flow" }
        }
      }
      draft.selection = [group.id]
      return group.id
    },
  }),

  defineCommand({
    id: "layout.align",
    title: "Align elements",
    group: "Element",
    description:
      "Align sibling nodes to a shared edge or center of their combined bounds: left/center-x/right/top/center-y/bottom. Anchors and sizes are preserved.",
    schema: z.object({
      ids: z.array(z.string()).min(2),
      edge: z.enum(["left", "center-x", "right", "top", "center-y", "bottom"]),
    }),
    invalidates: "layout",
    apply: (draft, args, { warn, measure }) => {
      const s = scene(draft)
      const { cw, ch, items } = resolveSiblings(
        s,
        args.ids,
        draft.selection,
        warn,
        measure
      )
      const placed = positionedItems(items, "align")
      const x0 = Math.min(...placed.map((i) => i.box.x))
      const x1 = Math.max(...placed.map((i) => i.box.x + i.box.w))
      const y0 = Math.min(...placed.map((i) => i.box.y))
      const y1 = Math.max(...placed.map((i) => i.box.y + i.box.h))
      for (const { n, box } of placed) {
        let x = box.x
        let y = box.y
        switch (args.edge) {
          case "left":
            x = x0
            break
          case "center-x":
            x = (x0 + x1) / 2 - box.w / 2
            break
          case "right":
            x = x1 - box.w
            break
          case "top":
            y = y0
            break
          case "center-y":
            y = (y0 + y1) / 2 - box.h / 2
            break
          case "bottom":
            y = y1 - box.h
            break
        }
        translateNode(n, (x - box.x) / cw, (y - box.y) / ch)
      }
    },
  }),

  defineCommand({
    id: "layout.distribute",
    title: "Distribute elements",
    group: "Element",
    description:
      "Space sibling nodes evenly along an axis. Without gap: first and last stay put, the middles spread evenly. With gap: packed from the first at a fixed spacing.",
    schema: z.object({
      ids: z.array(z.string()).min(3),
      direction: z.enum(["horizontal", "vertical"]),
      gap: z.number().min(0).optional(),
    }),
    invalidates: "layout",
    apply: (draft, args, { warn, measure }) => {
      const s = scene(draft)
      const { cw, ch, items } = resolveSiblings(
        s,
        args.ids,
        draft.selection,
        warn,
        measure
      )
      const placed = positionedItems(items, "distribute")
      const horiz = args.direction === "horizontal"
      const pos = (b: Rect) => (horiz ? b.x : b.y)
      const size = (b: Rect) => (horiz ? b.w : b.h)
      const sorted = [...placed].sort(
        (a, b) => pos(a.box) - pos(b.box) || a.index - b.index
      )

      const first = sorted[0].box
      let cursor: number
      let gap: number
      if (args.gap == null) {
        const last = sorted[sorted.length - 1].box
        const inner = pos(last) - (pos(first) + size(first))
        const middleSize = sorted
          .slice(1, -1)
          .reduce((sum, i) => sum + size(i.box), 0)
        gap = (inner - middleSize) / (sorted.length - 1)
        cursor = pos(first) + size(first) + gap
      } else {
        gap = args.gap
        cursor = pos(first) + size(first) + gap
      }
      const movable = args.gap == null ? sorted.slice(1, -1) : sorted.slice(1)
      for (const { n, box } of movable) {
        const delta = cursor - pos(box)
        translateNode(n, horiz ? delta / cw : 0, horiz ? 0 : delta / ch)
        cursor += size(box) + gap
      }
    },
  }),
]

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface SiblingItem {
  n: SceneNode
  box: Rect | null
  index: number
}

/** Resolve ids to nodes under ONE shared parent, with boxes in PARENT-local
 *  px: live measurement when a renderer is attached (auto sizes come back
 *  real), normalized-layout estimates headless. */
function resolveSiblings(
  s: Scene,
  rawIds: string[],
  selection: string[],
  warn: (m: string) => void,
  measure: (id: string) => Rect | null
): { parent: SceneNode; cw: number; ch: number; items: SiblingItem[] } {
  const ids = rawIds.map((id) => resolveNodeId(s, id, selection, warn))
  if (ids.includes("root")) {
    throw new CommandAbort("cannot arrange the root")
  }
  const parents = ids.map((id) => findParent(s, id))
  const parent = parents[0]
  if (!parent || parents.some((p) => p?.id !== parent.id)) {
    throw new CommandAbort("all ids must be siblings (share one parent)")
  }
  // Parent frame: measured boxes are scene-absolute, so re-express children
  // relative to the parent's origin; estimates are parent-relative already.
  const parentBox =
    parent.id === s.root.id
      ? { x: 0, y: 0, w: s.baseWidth, h: s.baseHeight }
      : measure(parent.id)
  const [cw, ch] = parentBox
    ? [parentBox.w, parentBox.h]
    : containerDims(s, parent)
  const children = parent.children ?? []
  const items = ids.map((id) => {
    const n = children.find((c) => c.id === id)!
    const m = parentBox ? measure(id) : null
    const box = m
      ? { x: m.x - parentBox!.x, y: m.y - parentBox!.y, w: m.w, h: m.h }
      : layoutToBox(n.layout, cw, ch)
    return { n, box, index: children.indexOf(n) }
  })
  return { parent, cw, ch, items }
}

/** Every item must have a resolvable (anchored) box for arrange commands. */
function positionedItems(
  items: SiblingItem[],
  verb: string
): Array<{ n: SceneNode; box: Rect; index: number }> {
  const missing = items.filter((i) => !i.box)
  if (missing.length) {
    throw new CommandAbort(
      `${verb} needs positioned siblings — ${missing
        .map((i) => `"${i.n.id}"`)
        .join(", ")} flow inside a stack (give them an absolute layout first)`
    )
  }
  return items as Array<{ n: SceneNode; box: Rect; index: number }>
}

/** Move a node by normalized fractions WITHOUT touching anchor/size/stack
 *  config — dx/dy are linear in the resolved position for every anchor. */
function translateNode(n: SceneNode, dxf: number, dyf: number): void {
  if (n.layout.mode === "flow") return
  n.layout = {
    ...n.layout,
    dx: round3((n.layout.dx ?? 0) + dxf),
    dy: round3((n.layout.dy ?? 0) + dyf),
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** Resolve a node's pixel size by walking the root→node path, falling back to
 *  the scene base size when a step is unresolvable (flow/auto). Estimates are
 *  fine here — stackify only orders siblings and roughs in the stack's box;
 *  the browser owns the real layout afterwards. */
function containerDims(s: Scene, target: SceneNode): [number, number] {
  const path: SceneNode[] = []
  const found = (function search(n: SceneNode): boolean {
    path.push(n)
    if (n.id === target.id) return true
    for (const c of n.children ?? []) if (search(c)) return true
    path.pop()
    return false
  })(s.root)
  let w = s.baseWidth
  let h = s.baseHeight
  if (!found) return [w, h]
  for (const n of path.slice(1)) {
    const box = layoutToBox(n.layout, w, h)
    if (box && box.w > 0 && box.h > 0) {
      w = box.w
      h = box.h
    }
  }
  return [w, h]
}
