// Direct-manipulation editing — select / drag / resize / keyboard, all
// expressed as dispatched COMMANDS through the same seam the agent uses
// (docs/plan/00-product.md: "direct manipulation as a peer"). A drag gesture
// coalesces into ONE history entry via begin/endGesture.
//
// v2 difference from v1: the canvas DOM is a flat pinned unit list, so DOM
// hit-testing is meaningless — hits resolve against measured boxes from the
// measurement pass, topmost-painted first.

import type { Box } from "./backend"
import type { Handle } from "./resize"
import type { SnapGuide } from "./snap"
import type { Scene, SceneNode } from "../scene/types"
import { CURSOR, resizeBox, snapResize } from "./resize"
import { collectSnapLines, computeSnap } from "./snap"
import { boxToLayoutPreserving } from "../scene/layout"
import { findNode, findParent, walk } from "../scene/model"

/** Snap magnetism radius in SCREEN px (divided by zoom for scene px). */
const SNAP_PX = 6

/** Floor for a resized box in scene px — small enough to make chips, large
 *  enough that a box can't collapse to an ungrabbable sliver. */
const MIN_SIZE = 12

/** Bounding box enclosing every box in the list. */
function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const w = Math.max(...boxes.map((b) => b.x + b.w)) - x
  const h = Math.max(...boxes.map((b) => b.y + b.h)) - y
  return { x, y, w, h }
}

export interface InteractionDeps {
  /** The artboard element (backend.stage) — pointer surface. */
  stage: HTMLElement
  scene: () => Scene
  selection: () => string[]
  measure: (id: string) => Box | null
  /** Viewport zoom, for client-px → scene-px conversion. */
  scale: () => number
  isPanning: () => boolean
  dispatch: (
    calls: Array<{ command: string; args?: Record<string, unknown> }>,
    opts?: { label?: string }
  ) => unknown
  beginGesture: (label: string) => void
  endGesture: () => void
  /** Double-click on an html leaf — the shell opens the inline text editor. */
  onEditText?: (node: SceneNode) => void
  /** Active snap guides during a drag (empty = clear). Overlay renders them. */
  onGuides?: (guides: SnapGuide[]) => void
  /** Hovered node under the idle pointer (null = none / gesture in flight).
   *  Overlay renders the hover outline — the "this is grabbable" affordance. */
  onHover?: (node: SceneNode | null) => void
}

export class Interaction {
  private disposers: Array<() => void> = []
  private gesture = false

  constructor(private deps: InteractionDeps) {
    const { stage } = deps
    // The canvas hosts real DOM (text, images): kill the browser's own drag /
    // selection affordances so gestures stay ours. NEVER preventDefault the
    // pointerdown itself — cancelling it suppresses the compatibility mouse
    // events (mousedown/mouseup/dblclick), which silently breaks
    // double-click-to-edit-text.
    stage.style.cursor = "default"
    stage.style.userSelect = "none"
    const onDragStart = (e: Event) => e.preventDefault()
    const onLeave = () => this.deps.onHover?.(null)
    stage.addEventListener("pointerdown", this.onPointerDown)
    stage.addEventListener("dblclick", this.onDoubleClick)
    stage.addEventListener("dragstart", onDragStart)
    stage.addEventListener("pointermove", this.onHoverMove)
    stage.addEventListener("pointerleave", onLeave)
    window.addEventListener("keydown", this.onKey)
    this.disposers.push(
      () => stage.removeEventListener("pointerdown", this.onPointerDown),
      () => stage.removeEventListener("dblclick", this.onDoubleClick),
      () => stage.removeEventListener("dragstart", onDragStart),
      () => stage.removeEventListener("pointermove", this.onHoverMove),
      () => stage.removeEventListener("pointerleave", onLeave),
      () => window.removeEventListener("keydown", this.onKey)
    )
  }

  /** Body-level cursor during a gesture — the pointer is captured by window
   *  listeners and often outside the stage, so stage-scoped cursor won't hold. */
  private setGestureCursor(cursor: string | null) {
    document.body.style.cursor = cursor ?? ""
  }

  private onHoverMove = (e: PointerEvent) => {
    if (!this.deps.onHover) return
    if (this.gesture || this.deps.isPanning()) return
    const pt = this.scenePoint(e)
    this.deps.onHover(this.hitTest(pt.x, pt.y))
  }

  private onDoubleClick = (e: MouseEvent) => {
    if (this.deps.isPanning() || !this.deps.onEditText) return
    const r = this.deps.stage.getBoundingClientRect()
    const scale = this.deps.scale()
    const hit = this.hitTest(
      (e.clientX - r.left) / scale,
      (e.clientY - r.top) / scale
    )
    // Only html leaves are text-editable in place.
    if (hit && hit.html !== undefined && !hit.children?.length) {
      this.select([hit.id])
      this.deps.onEditText(hit)
      e.preventDefault()
    }
  }

  /** Topmost node under a scene-px point. Later-painted (deeper / later
   *  sibling) wins; hidden and locked nodes are transparent to hits. */
  hitTest(x: number, y: number): SceneNode | null {
    const scene = this.deps.scene()
    const ordered: SceneNode[] = []
    walk(scene.root, (n) => {
      if (n.id !== scene.root.id && !n.hidden) ordered.push(n)
    })
    for (let i = ordered.length - 1; i >= 0; i--) {
      const n = ordered[i]
      if (n.locked) continue
      const b = this.deps.measure(n.id)
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return n
      }
    }
    return null
  }

  private scenePoint(e: PointerEvent): { x: number; y: number } {
    const r = this.deps.stage.getBoundingClientRect()
    const scale = this.deps.scale()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  /** Parent container box (px) for resolving a node's normalized layout. */
  private parentBox(id: string): Box {
    const scene = this.deps.scene()
    const parent = findParent(scene, id)
    if (parent && parent.id !== scene.root.id) {
      const pb = this.deps.measure(parent.id)
      if (pb) return pb
    }
    return { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight }
  }

  private select(ids: string[] | null) {
    this.deps.dispatch([{ command: "element.select", args: { ids } }])
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.deps.isPanning()) return
    const target = e.target as HTMLElement
    // Resize handles are overlay-owned; they call startResize directly.
    if (target.closest("[data-resize-handle]")) return

    const pt = this.scenePoint(e)
    const hit = this.hitTest(pt.x, pt.y)
    if (!hit) {
      this.select(null)
      return
    }

    const selection = this.deps.selection()
    if (e.shiftKey) {
      const next = selection.includes(hit.id)
        ? selection.filter((s) => s !== hit.id)
        : [...selection, hit.id]
      this.select(next.length ? next : null)
      return
    }
    if (!selection.includes(hit.id)) this.select([hit.id])

    this.dragSelection(e)
  }

  /** Drag the whole current selection by the same delta; one history entry. */
  private dragSelection(e: PointerEvent) {
    const scene = this.deps.scene()
    const scale = this.deps.scale()
    const startX = e.clientX
    const startY = e.clientY
    const moving = this.deps
      .selection()
      .map((sid) => {
        const n = findNode(scene, sid)
        const box = this.deps.measure(sid)
        // Flow children are placed by their parent stack — dragging one would
        // only be honored by flattening it to absolute (yanking it out of the
        // flow), so they don't participate in a free drag.
        if (!n || !box || n.locked || n.layout.mode === "flow") return null
        return { id: sid, layout: n.layout, box, pb: this.parentBox(sid) }
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
    if (!moving.length) return

    // Static snap candidates, computed once per drag: every visible box
    // outside the moving selection, plus the canvas frame (edges + center).
    const movingIds = new Set(moving.map((m) => m.id))
    const staticBoxes: Box[] = [
      { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight },
    ]
    walk(scene.root, (n) => {
      if (movingIds.has(n.id)) return false // the whole moving subtree
      if (n.hidden) return false
      if (n.id === scene.root.id) return
      const b = this.deps.measure(n.id)
      if (b) staticBoxes.push(b)
    })
    const candidates = collectSnapLines(staticBoxes)
    const union: Box = {
      x: Math.min(...moving.map((m) => m.box.x)),
      y: Math.min(...moving.map((m) => m.box.y)),
      w: 0,
      h: 0,
    }
    union.w = Math.max(...moving.map((m) => m.box.x + m.box.w)) - union.x
    union.h = Math.max(...moving.map((m) => m.box.y + m.box.h)) - union.y

    let began = false
    let lastGuideKey = ""
    const emitGuides = (guides: SnapGuide[]) => {
      // Skip no-op emits — a fresh [] every mousemove would re-render the
      // overlay tree continuously.
      const key = JSON.stringify(guides)
      if (key === lastGuideKey) return
      lastGuideKey = key
      this.deps.onGuides?.(guides)
    }
    const move = (ev: PointerEvent) => {
      let ddx = (ev.clientX - startX) / scale
      let ddy = (ev.clientY - startY) / scale
      if (!began && Math.hypot(ddx, ddy) * scale < 3) return // click ≠ drag
      if (!began) {
        this.deps.beginGesture(
          moving.length > 1 ? "Move elements" : "Move element"
        )
        began = true
        this.gesture = true
        this.setGestureCursor("move")
        this.deps.onHover?.(null)
      }
      if (ev.altKey) {
        emitGuides([])
      } else {
        const snap = computeSnap(
          { x: union.x + ddx, y: union.y + ddy, w: union.w, h: union.h },
          candidates,
          SNAP_PX / scale
        )
        ddx += snap.dx
        ddy += snap.dy
        emitGuides(snap.guides)
      }
      const calls = moving.flatMap((m) => {
        const layout = boxToLayoutPreserving(
          m.layout,
          m.box.x - m.pb.x + ddx,
          m.box.y - m.pb.y + ddy,
          m.box.w,
          m.box.h,
          m.pb.w,
          m.pb.h
        )
        if (!layout) return []
        return [{ command: "element.setLayout", args: { id: m.id, layout } }]
      })
      if (calls.length) this.deps.dispatch(calls)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      emitGuides([])
      if (began) {
        this.deps.endGesture()
        this.gesture = false
        this.setGestureCursor(null)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }

  /** Resize the selection from one of its eight handles (the overlay calls in
   *  with the grabbed handle). A single element resizes its own box; a
   *  multi-selection scales the whole group's bounding box, mapping the same
   *  scale onto every member. Shift locks aspect, Alt resizes from the center,
   *  and the moving edges snap to siblings/frame just like a drag. */
  startResize(e: PointerEvent, handle: Handle): void {
    e.stopPropagation()
    e.preventDefault()
    const scene = this.deps.scene()
    const scale = this.deps.scale()
    const items = this.deps
      .selection()
      .map((sid) => {
        const n = findNode(scene, sid)
        const box = this.deps.measure(sid)
        if (!n || !box || n.locked || n.layout.mode === "flow") return null
        return { id: sid, layout: n.layout, box, pb: this.parentBox(sid) }
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
    if (!items.length) return

    // The handle grid acts on the group's bounding box (its own box when one).
    const start = unionBox(items.map((i) => i.box))

    // Static snap candidates: every visible box outside the selection + frame.
    const movingIds = new Set(items.map((i) => i.id))
    const staticBoxes: Box[] = [
      { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight },
    ]
    walk(scene.root, (n) => {
      if (movingIds.has(n.id)) return false
      if (n.hidden) return false
      if (n.id === scene.root.id) return
      const b = this.deps.measure(n.id)
      if (b) staticBoxes.push(b)
    })
    const candidates = collectSnapLines(staticBoxes)

    const startX = e.clientX
    const startY = e.clientY
    this.deps.beginGesture(
      items.length > 1 ? "Resize elements" : "Resize element"
    )
    this.gesture = true
    this.setGestureCursor(CURSOR[handle])
    this.deps.onHover?.(null)

    let lastGuideKey = ""
    const emitGuides = (guides: SnapGuide[]) => {
      const key = JSON.stringify(guides)
      if (key === lastGuideKey) return
      lastGuideKey = key
      this.deps.onGuides?.(guides)
    }

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale
      const dy = (ev.clientY - startY) / scale
      const opts = { min: MIN_SIZE, aspect: ev.shiftKey, center: ev.altKey }
      let next = resizeBox(start, handle, dx, dy, opts)
      const snapped = snapResize(
        next,
        start,
        handle,
        candidates,
        SNAP_PX / scale,
        opts
      )
      next = snapped.box
      emitGuides(snapped.guides)

      // Map the group box's transform onto every member (identity when one).
      const sx = start.w > 0 ? next.w / start.w : 1
      const sy = start.h > 0 ? next.h / start.h : 1
      const calls = items.flatMap((it) => {
        const layout = boxToLayoutPreserving(
          it.layout,
          next.x + (it.box.x - start.x) * sx - it.pb.x,
          next.y + (it.box.y - start.y) * sy - it.pb.y,
          it.box.w * sx,
          it.box.h * sy,
          it.pb.w,
          it.pb.h
        )
        if (!layout) return []
        return [{ command: "element.setLayout", args: { id: it.id, layout } }]
      })
      if (calls.length) this.deps.dispatch(calls)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      emitGuides([])
      this.deps.endGesture()
      this.gesture = false
      this.setGestureCursor(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (
      t.isContentEditable ||
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA"
    )
      return
    const selection = this.deps.selection()
    const id = selection[selection.length - 1]
    if (!id) return

    if (e.key === "Escape") {
      this.select(null)
      e.preventDefault()
    } else if (e.key === "Delete" || e.key === "Backspace") {
      this.deps.dispatch([
        { command: "element.delete", args: { ids: selection } },
      ])
      e.preventDefault()
    } else if (e.key === "]" || e.key === "[") {
      this.deps.dispatch([
        {
          command: "element.reorder",
          args: { id, direction: e.key === "]" ? "forward" : "backward" },
        },
      ])
    } else if (e.key.startsWith("Arrow")) {
      const scene = this.deps.scene()
      const node = findNode(scene, id)
      if (!node || node.layout.mode !== "absolute") return
      const stepX = (e.shiftKey ? 10 : 1) / scene.baseWidth
      const stepY = (e.shiftKey ? 10 : 1) / scene.baseHeight
      const layout = { ...node.layout }
      if (e.key === "ArrowLeft") layout.dx -= stepX
      if (e.key === "ArrowRight") layout.dx += stepX
      if (e.key === "ArrowUp") layout.dy -= stepY
      if (e.key === "ArrowDown") layout.dy += stepY
      this.deps.dispatch(
        [{ command: "element.setLayout", args: { id, layout } }],
        { label: "Nudge" }
      )
      e.preventDefault()
    }
  }

  dispose() {
    for (const d of this.disposers) d()
  }
}
