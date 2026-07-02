// Direct-manipulation editing — select / drag / resize / keyboard, all
// expressed as dispatched COMMANDS through the same seam the agent uses
// (docs/plan/00-product.md: "direct manipulation as a peer"). A drag gesture
// coalesces into ONE history entry via begin/endGesture.
//
// v2 difference from v1: the canvas DOM is a flat pinned unit list, so DOM
// hit-testing is meaningless — hits resolve against measured boxes from the
// measurement pass, topmost-painted first.

import type { Box } from "./backend"
import type { Layout } from "../scene/layout"
import type { Scene, SceneNode } from "../scene/types"
import { boxToLayout } from "../scene/layout"
import { findNode, findParent, walk } from "../scene/model"

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
}

export class Interaction {
  private disposers: Array<() => void> = []

  constructor(private deps: InteractionDeps) {
    const { stage } = deps
    stage.addEventListener("pointerdown", this.onPointerDown)
    window.addEventListener("keydown", this.onKey)
    this.disposers.push(
      () => stage.removeEventListener("pointerdown", this.onPointerDown),
      () => window.removeEventListener("keydown", this.onKey)
    )
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
    e.preventDefault()
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
        if (!n || !box || n.locked) return null
        return { id: sid, layout: n.layout, box, pb: this.parentBox(sid) }
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
    if (!moving.length) return

    let began = false
    const move = (ev: PointerEvent) => {
      const ddx = (ev.clientX - startX) / scale
      const ddy = (ev.clientY - startY) / scale
      if (!began && Math.hypot(ddx, ddy) * scale < 3) return // click ≠ drag
      if (!began) {
        this.deps.beginGesture(
          moving.length > 1 ? "Move elements" : "Move element"
        )
        began = true
      }
      const calls = moving.map((m) => {
        const anchor =
          m.layout.mode === "absolute" ? m.layout.anchor : ("top-left" as const)
        const relX = m.box.x - m.pb.x + ddx
        const relY = m.box.y - m.pb.y + ddy
        const layout: Layout = boxToLayout(
          relX,
          relY,
          m.box.w,
          m.box.h,
          m.pb.w,
          m.pb.h,
          anchor
        )
        return { command: "element.setLayout", args: { id: m.id, layout } }
      })
      this.deps.dispatch(calls)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      if (began) this.deps.endGesture()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /** Resize the primary selection from its corner handle (overlay calls in). */
  startResize(e: PointerEvent): void {
    e.stopPropagation()
    e.preventDefault()
    const scene = this.deps.scene()
    const selection = this.deps.selection()
    const id = selection[selection.length - 1]
    const node = id ? findNode(scene, id) : null
    const box = id ? this.deps.measure(id) : null
    if (!id || !node || !box) return
    const pb = this.parentBox(id)
    const scale = this.deps.scale()
    const startX = e.clientX
    const startY = e.clientY
    this.deps.beginGesture("Resize element")
    const move = (ev: PointerEvent) => {
      const w = Math.max(24, box.w + (ev.clientX - startX) / scale)
      const h = Math.max(24, box.h + (ev.clientY - startY) / scale)
      const anchor =
        node.layout.mode === "absolute"
          ? node.layout.anchor
          : ("top-left" as const)
      const layout: Layout = boxToLayout(
        box.x - pb.x,
        box.y - pb.y,
        w,
        h,
        pb.w,
        pb.h,
        anchor
      )
      this.deps.dispatch([
        { command: "element.setLayout", args: { id, layout } },
      ])
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.deps.endGesture()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
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

    if (e.key === "Delete" || e.key === "Backspace") {
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
