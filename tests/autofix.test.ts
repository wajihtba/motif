// Auto-fix golden tests — pure scenes + a Map-backed measure fn, mirroring
// lint.test.ts. The contract under test: for each lint finding kind, autofix
// emits element.setLayout nudges that actually clear the finding (verified by
// resolving the emitted layouts back to boxes and re-linting).

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { Layout } from "@/scene/layout"
import type { SceneNode } from "@/scene/types"
import { autofixLayout } from "@/controller/autofix"
import { lintLayout } from "@/controller/lint"
import { boxToLayout, layoutToBox } from "@/scene/layout"
import { emptyScene, node } from "@/scene/model"

const BASE = 1080 // emptyScene() is 1080×1080

function sceneWith(children: SceneNode[]) {
  const s = emptyScene()
  s.root.children = children
  return s
}

function measurer(boxes: Record<string, Box>) {
  return (id: string): Box | null => boxes[id] ?? null
}

/** A text leaf whose layout agrees with its measured box (root container). */
const text = (id: string, box: Box, extra: Partial<SceneNode> = {}) =>
  node({
    id,
    role: "headline",
    html: "Slow Roast Sunday",
    layout: boxToLayout(box.x, box.y, box.w, box.h, BASE, BASE),
    ...extra,
  })

/** Re-resolve boxes after applying autofix's emitted layouts. */
function applyFixes(
  scene: ReturnType<typeof sceneWith>,
  boxes: Record<string, Box>
): Record<string, Box> {
  const calls = autofixLayout(scene, measurer(boxes), lint(scene, boxes))
  const next: Record<string, Box> = { ...boxes }
  for (const call of calls) {
    expect(call.command).toBe("element.setLayout")
    const { id, layout } = call.args as { id: string; layout: Layout }
    const box = layoutToBox(layout, BASE, BASE)
    expect(box).not.toBeNull()
    next[id] = box!
    // keep the scene consistent so a re-lint sees the new layout too
    const n = scene.root.children!.find((c) => c.id === id)
    if (n) n.layout = layout
  }
  return next
}

const lint = (scene: ReturnType<typeof sceneWith>, boxes: Record<string, Box>) =>
  lintLayout(scene, measurer(boxes))

describe("autofix: overlap", () => {
  it("separates two colliding text leaves and clears the finding", () => {
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 180, w: 400, h: 60 },
    }
    const s = sceneWith([text("a", boxes.a), text("b", boxes.b)])
    expect(lint(s, boxes)).toHaveLength(1)

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    // only ONE box moved, the minimal-disruption fix
    expect(fixed.a).toEqual(boxes.a)
  })

  it("stays inside the frame when the collision sits at the bottom edge", () => {
    // Pushing the lower box further down would overflow the canvas — the
    // fixer must find the empty space ABOVE instead.
    const boxes = {
      a: { x: 100, y: 860, w: 400, h: 160 },
      b: { x: 120, y: 960, w: 400, h: 120 },
    }
    const s = sceneWith([text("a", boxes.a), text("b", boxes.b)])
    expect(lint(s, boxes)).toHaveLength(1)

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    for (const box of Object.values(fixed)) {
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.h).toBeLessThanOrEqual(BASE)
    }
  })

  it("places into the nearest empty space without hitting other content", () => {
    // a/b collide mid-page; a card fills everything below them, so the naive
    // "push down" would land b straight on the card. The empty space is
    // above — the fixer must see the whole page and go there.
    const boxes = {
      a: { x: 100, y: 400, w: 400, h: 120 },
      b: { x: 120, y: 480, w: 400, h: 100 },
      card: { x: 100, y: 600, w: 500, h: 400 },
    }
    const s = sceneWith([
      text("a", boxes.a),
      text("b", boxes.b),
      node({
        id: "card",
        role: "badge",
        css: { background: "#1e140a" },
        layout: boxToLayout(100, 600, 500, 400, BASE, BASE),
      }),
    ])
    expect(lint(s, boxes)).toHaveLength(1)

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    expect(fixed.card).toEqual(boxes.card) // untouched
    expect(fixed.b.y + fixed.b.h).toBeLessThanOrEqual(boxes.a.y) // went up
  })

  it("moves sideways when vertical space is fully blocked", () => {
    // Cards fill the page above and below the colliding pair — the only free
    // space is to the right.
    const boxes = {
      top: { x: 100, y: 0, w: 500, h: 380 },
      a: { x: 150, y: 400, w: 400, h: 120 },
      b: { x: 170, y: 460, w: 400, h: 100 },
      bottom: { x: 100, y: 600, w: 500, h: 480 },
    }
    const card = (id: string, b: Box) =>
      node({
        id,
        role: "badge",
        css: { background: "#1e140a" },
        layout: boxToLayout(b.x, b.y, b.w, b.h, BASE, BASE),
      })
    const s = sceneWith([
      card("top", boxes.top),
      text("a", boxes.a),
      text("b", boxes.b),
      card("bottom", boxes.bottom),
    ])
    expect(lint(s, boxes)).toHaveLength(1)

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    expect(fixed.top).toEqual(boxes.top)
    expect(fixed.bottom).toEqual(boxes.bottom)
    // the mover slid right, past the pair's shared column
    expect(fixed.b.x).toBeGreaterThan(boxes.a.x + boxes.a.w)
  })

  it("never moves flow children or locked nodes", () => {
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 180, w: 400, h: 60 },
    }
    const s = sceneWith([
      text("a", boxes.a, { locked: true }),
      text("b", boxes.b),
    ])
    const calls = autofixLayout(s, measurer(boxes), lint(s, boxes))
    expect(calls.map((c) => (c.args as { id: string }).id)).toEqual(["b"])
  })

  it("emits nothing when neither offender is movable", () => {
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 180, w: 400, h: 60 },
    }
    const s = sceneWith([
      text("a", boxes.a, { locked: true }),
      text("b", boxes.b, { locked: true }),
    ])
    expect(autofixLayout(s, measurer(boxes), lint(s, boxes))).toHaveLength(0)
  })

  it("resolves a chain of overlaps in one pass without new collisions", () => {
    // Three texts stacked into each other — sequential fixes must account
    // for the boxes already moved earlier in the same pass.
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 110, y: 170, w: 400, h: 120 },
      c: { x: 120, y: 240, w: 400, h: 120 },
    }
    const s = sceneWith([
      text("a", boxes.a),
      text("b", boxes.b),
      text("c", boxes.c),
    ])
    expect(lint(s, boxes).length).toBeGreaterThanOrEqual(2)

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
  })
})

describe("autofix: frame-overflow", () => {
  it("pulls overflowing text back inside the canvas", () => {
    const boxes = { a: { x: -40, y: 900, w: 400, h: 260 } } // off left+bottom
    const s = sceneWith([text("a", boxes.a)])
    expect(lint(s, boxes).map((f) => f.kind)).toContain("frame-overflow")

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    expect(fixed.a.x).toBeGreaterThanOrEqual(0)
    expect(fixed.a.y + fixed.a.h).toBeLessThanOrEqual(BASE)
  })

  it("does not cure an overflow by parking on top of other content", () => {
    // a hangs off the left edge; the spot a plain clamp would choose is
    // occupied by a card — the fixer must clamp AND dodge.
    const boxes = {
      a: { x: -200, y: 400, w: 180, h: 100 },
      card: { x: 4, y: 380, w: 300, h: 200 },
    }
    const s = sceneWith([
      text("a", boxes.a),
      node({
        id: "card",
        role: "badge",
        css: { background: "#1e140a" },
        layout: boxToLayout(4, 380, 300, 200, BASE, BASE),
      }),
    ])
    expect(lint(s, boxes).map((f) => f.kind)).toEqual(["frame-overflow"])

    const fixed = applyFixes(s, boxes)
    expect(lint(s, fixed)).toHaveLength(0)
    expect(fixed.a.x).toBeGreaterThanOrEqual(0)
    expect(fixed.card).toEqual(boxes.card)
  })
})

describe("autofix: container-overflow", () => {
  it("pulls spilled text back inside its card", () => {
    const boxes = {
      card: { x: 200, y: 200, w: 500, h: 300 },
      label: { x: 240, y: 440, w: 300, h: 100 }, // spills 40px past the bottom
    }
    const s = sceneWith([
      node({
        id: "card",
        role: "badge",
        css: { background: "#1e140a" },
        layout: boxToLayout(200, 200, 500, 300, BASE, BASE),
        children: [
          node({
            id: "label",
            role: "headline",
            html: "Spilled",
            layout: boxToLayout(40, 240, 300, 100, 500, 300),
          }),
        ],
      }),
    ])
    expect(lint(s, boxes).map((f) => f.kind)).toContain("container-overflow")

    const calls = autofixLayout(s, measurer(boxes), lint(s, boxes))
    expect(calls).toHaveLength(1)
    const { id, layout } = calls[0].args as { id: string; layout: Layout }
    expect(id).toBe("label")
    // label's container is the card (500×300) — resolve it locally, then
    // check it sits inside the card in scene space
    const local = layoutToBox(layout, 500, 300)!
    const sceneBox = {
      x: boxes.card.x + local.x,
      y: boxes.card.y + local.y,
      w: local.w,
      h: local.h,
    }
    expect(sceneBox.y + sceneBox.h).toBeLessThanOrEqual(
      boxes.card.y + boxes.card.h
    )
    expect(lint(s, { ...boxes, label: sceneBox })).toHaveLength(0)
  })
})
