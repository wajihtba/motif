// Layers panel logic (headless): the drag-and-drop reorder math and the Code
// panel's round-trip contract — a scene serialized to JSON and re-applied
// through scene.apply comes back equivalent (the scene file is the source of
// truth, and viewing it must not perturb it).

import { describe, expect, it } from "vitest"
import { EditorController } from "@/controller"
import { computeLayerMove } from "@/components/panels/layers-move"
import { emptyScene, node, rootNode } from "@/scene/model"
import type { Scene } from "@/scene/types"

function sceneWith(children: ReturnType<typeof node>[]): Scene {
  return { ...emptyScene(), root: rootNode(children) }
}

const ids = (s: Scene, parentId = "root") => {
  const find = (n: typeof s.root): typeof s.root | undefined => {
    if (n.id === parentId) return n
    for (const c of n.children ?? []) {
      const hit = find(c)
      if (hit) return hit
    }
    return undefined
  }
  return (find(s.root)?.children ?? []).map((c) => c.id)
}

describe("computeLayerMove — reorder within one parent", () => {
  const scene = sceneWith([
    node({ id: "A" }),
    node({ id: "B" }),
    node({ id: "C" }),
  ])

  it("dropping onto itself is a no-op", () => {
    expect(computeLayerMove(scene, "A", { id: "A", pos: "before" })).toBeNull()
  })

  it("moving down (A before C) lands A just before C", () => {
    const m = computeLayerMove(scene, "A", { id: "C", pos: "before" })!
    // simulate move: remove A, insert at index → [B, A, C]
    expect(applyMove(scene, "A", m)).toEqual(["B", "A", "C"])
  })

  it("moving down (A after C) lands A last", () => {
    const m = computeLayerMove(scene, "A", { id: "C", pos: "after" })!
    expect(applyMove(scene, "A", m)).toEqual(["B", "C", "A"])
  })

  it("moving up (C before A) lands C first", () => {
    const m = computeLayerMove(scene, "C", { id: "A", pos: "before" })!
    expect(applyMove(scene, "C", m)).toEqual(["C", "A", "B"])
  })
})

describe("computeLayerMove — reparent", () => {
  const scene = sceneWith([
    node({ id: "A" }),
    node({ id: "G", children: [node({ id: "X" })] }),
  ])

  it("dropping inside a group appends to its children", () => {
    const m = computeLayerMove(scene, "A", { id: "G", pos: "inside" })!
    expect(m).toEqual({ parentId: "G", index: 1 })
  })
})

// Replays a resolved move against a fresh controller and returns the new child
// order under root, proving the computed index matches element.move semantics.
function applyMove(
  scene: Scene,
  id: string,
  move: { parentId: string; index: number }
): string[] {
  const ctrl = new EditorController()
  ctrl.dispatch({ command: "scene.apply", args: { root: scene.root } })
  ctrl.dispatch({ command: "element.move", args: { id, ...move } })
  return ids(ctrl.store.state.document.scene, move.parentId)
}

describe("scene round-trip (Code panel source-of-truth contract)", () => {
  it("serialize → scene.apply comes back structurally equal", () => {
    const ctrl = new EditorController()
    ctrl.dispatch([
      { command: "element.create", args: { role: "headline", html: "Hi" } },
      {
        command: "element.create",
        args: { role: "group", node: { children: [] } },
      },
      { command: "scene.setBackground", args: { value: "#101010" } },
      { command: "theme.setToken", args: { key: "--primary", value: "red" } },
    ])
    const before = ctrl.store.state.document.scene
    // What the Code panel does: read the scene as JSON and re-apply it.
    const json = JSON.parse(JSON.stringify(before))
    ctrl.dispatch({ command: "scene.apply", args: json })
    const after = ctrl.store.state.document.scene
    expect(stable(after)).toEqual(stable(before))
  })
})

function stable(v: unknown): unknown {
  return JSON.parse(
    JSON.stringify(v, (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.keys(val as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((a, k) => {
              a[k] = (val as Record<string, unknown>)[k]
              return a
            }, {})
        : val
    )
  )
}
