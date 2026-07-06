// Interaction integration tests — drive the real Interaction class with
// synthetic pointer events against a fake backend, asserting the COMMANDS it
// dispatches. This is the actual drag/resize path the canvas uses (jsdom gives
// us real DOM listeners; the code only reads MouseEvent-compatible fields).

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Box } from "@/engine/backend"
import type { Layout } from "@/scene/layout"
import type { Scene, SceneNode } from "@/scene/types"
import { Interaction } from "@/engine/interaction"
import { emptyScene, node } from "@/scene/model"

interface Dispatched {
  command: string
  args?: Record<string, unknown>
}

function setup(child: SceneNode, box: Box) {
  const scene: Scene = emptyScene()
  scene.root.children = [child]
  const boxes: Record<string, Box> = {
    root: { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight },
    [child.id]: box,
  }
  const stage = document.createElement("div")
  document.body.appendChild(stage)

  const calls: Dispatched[] = []
  const begin = vi.fn()
  const end = vi.fn()
  let selection = [child.id]

  const interaction = new Interaction({
    stage,
    scene: () => scene,
    selection: () => selection,
    measure: (id) => boxes[id] ?? null,
    scale: () => 1,
    isPanning: () => false,
    dispatch: (c) => {
      for (const call of c) {
        calls.push(call)
        if (call.command === "element.select")
          selection = (call.args?.ids as string[] | undefined) ?? []
      }
    },
    beginGesture: begin,
    endGesture: end,
  })

  return { scene, stage, calls, begin, end, interaction, child }
}

/** jsdom has no PointerEvent constructor, but the interaction layer only reads
 *  MouseEvent fields — dispatching a MouseEvent under the pointer* type fires
 *  the same listeners. */
function pointer(
  type: string,
  x: number,
  y: number,
  opts: MouseEventInit = {}
): MouseEvent {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    ...opts,
  })
}

const lastLayout = (calls: Dispatched[]): Layout =>
  [...calls].reverse().find((c) => c.command === "element.setLayout")?.args
    ?.layout as Layout

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("drag", () => {
  it("moves an absolute element by the pointer delta as one gesture", () => {
    const el = node({
      id: "a",
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0,
        dy: 0,
        width: 0.2,
        height: 0.1,
      },
    })
    const { stage, calls, begin, end } = setup(el, {
      x: 100,
      y: 100,
      w: 200,
      h: 100,
    })

    stage.dispatchEvent(pointer("pointerdown", 150, 150))
    window.dispatchEvent(pointer("pointermove", 400, 150))
    window.dispatchEvent(pointer("pointerup", 400, 150))

    expect(begin).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
    const l = lastLayout(calls)
    expect(l.mode).toBe("absolute")
    // dragged +250px on a 1080 canvas → dx ≈ (100+250)/1080
    if (l.mode === "absolute") expect(l.dx).toBeCloseTo(350 / 1080, 3)
  })

  it("does not start a gesture for a sub-threshold click", () => {
    const el = node({ id: "a" })
    const { stage, begin } = setup(el, { x: 100, y: 100, w: 200, h: 100 })
    stage.dispatchEvent(pointer("pointerdown", 150, 150))
    window.dispatchEvent(pointer("pointermove", 151, 151)) // < 3px
    window.dispatchEvent(pointer("pointerup", 151, 151))
    expect(begin).not.toHaveBeenCalled()
  })

  it("preserves stack mode instead of flattening it to absolute", () => {
    const el = node({
      id: "a",
      layout: {
        mode: "stack",
        direction: "row",
        gap: 8,
        align: "start",
        justify: "start",
        anchor: "top-left",
        dx: 0,
        dy: 0,
        width: 0.2,
        height: 0.1,
      },
    })
    const { stage, calls } = setup(el, { x: 100, y: 100, w: 200, h: 100 })
    stage.dispatchEvent(pointer("pointerdown", 150, 150))
    window.dispatchEvent(pointer("pointermove", 300, 200))
    window.dispatchEvent(pointer("pointerup", 300, 200))
    const l = lastLayout(calls)
    expect(l.mode).toBe("stack")
    if (l.mode === "stack") {
      expect(l.direction).toBe("row")
      expect(l.gap).toBe(8) // stack fields survive the drag
    }
  })

  it("leaves a flow child in the flow (no free reposition)", () => {
    const el = node({ id: "a", layout: { mode: "flow" } })
    const { stage, calls, begin } = setup(el, {
      x: 100,
      y: 100,
      w: 200,
      h: 100,
    })
    stage.dispatchEvent(pointer("pointerdown", 150, 150))
    window.dispatchEvent(pointer("pointermove", 300, 200))
    window.dispatchEvent(pointer("pointerup", 300, 200))
    expect(begin).not.toHaveBeenCalled()
    expect(calls.some((c) => c.command === "element.setLayout")).toBe(false)
  })
})

describe("resize", () => {
  const fakeStart = () =>
    ({
      stopPropagation() {},
      preventDefault() {},
      clientX: 0,
      clientY: 0,
    }) as unknown as PointerEvent

  it("grows the box from the se handle, top-left fixed", () => {
    const el = node({
      id: "a",
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0,
        dy: 0,
        width: 0.2,
        height: 0.1,
      },
    })
    const { calls, begin, end, interaction } = setup(el, {
      x: 100,
      y: 100,
      w: 200,
      h: 100,
    })

    interaction.startResize(fakeStart(), "se")
    window.dispatchEvent(pointer("pointermove", 40, 30))
    window.dispatchEvent(pointer("pointerup", 40, 30))

    expect(begin).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
    const l = lastLayout(calls)
    expect(l.mode).toBe("absolute")
    if (l.mode === "absolute") {
      expect(l.width).toBeCloseTo(240 / 1080, 3)
      expect(l.height).toBeCloseTo(130 / 1080, 3)
      // top-left corner stays put (anchor top-left, dx/dy unchanged)
      expect(l.dx).toBeCloseTo(100 / 1080, 3)
    }
  })

  it("preserves aspect ratio on a corner with Shift", () => {
    const el = node({
      id: "a",
      layout: {
        mode: "absolute",
        anchor: "top-left",
        dx: 0,
        dy: 0,
        width: 0.2,
        height: 0.1,
      },
    })
    const { calls, interaction } = setup(el, { x: 100, y: 100, w: 200, h: 100 })
    interaction.startResize(fakeStart(), "se")
    window.dispatchEvent(pointer("pointermove", 200, 10, { shiftKey: true }))
    window.dispatchEvent(pointer("pointerup", 200, 10, { shiftKey: true }))
    const l = lastLayout(calls)
    if (l.mode === "absolute") {
      // 2:1 ratio preserved: width ×2 → height ×2
      expect((l.width as number) / (l.height as number)).toBeCloseTo(2, 2)
    }
  })
})
