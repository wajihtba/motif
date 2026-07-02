// Undo/redo byte-stability (eval lane 1): 50 mixed steps forward, 50 back,
// 50 forward again — the document must round-trip byte-identical at every
// depth. This is the test that catches patch/inverse-patch drift.

import { describe, expect, it } from "vitest"
import { EditorController } from "@/controller"

const snap = (ctrl: EditorController) =>
  JSON.stringify(ctrl.store.state.document)

describe("undo/redo", () => {
  it("50 mixed steps are byte-stable through undo-all → redo-all", () => {
    const ctrl = new EditorController()
    const snapshots: string[] = [snap(ctrl)]
    const ids: string[] = []

    // 50 deterministic mixed steps
    for (let i = 0; i < 50; i++) {
      switch (i % 5) {
        case 0: {
          const r = ctrl.dispatch({
            command: "element.create",
            args: { role: "badge", html: `n${i}` },
          })
          ids.push(r.returns[0] as string)
          break
        }
        case 1:
          ctrl.dispatch({
            command: "element.setStyle",
            args: { id: ids[ids.length - 1], css: { color: `rgb(${i},0,0)` } },
          })
          break
        case 2:
          ctrl.dispatch({
            command: "theme.setToken",
            args: { key: "--primary", value: `hsl(${i} 50% 50%)` },
          })
          break
        case 3:
          ctrl.dispatch([
            { command: "scene.setBackground", args: { value: `#0${i % 10}0` } },
            {
              command: "element.setLayout",
              args: {
                id: ids[ids.length - 1],
                layout: {
                  mode: "absolute",
                  anchor: "center",
                  dx: i / 100,
                  dy: 0,
                  width: 0.2,
                  height: 0.1,
                },
              },
            },
          ])
          break
        case 4:
          ctrl.dispatch({
            command: "element.duplicate",
            args: { id: ids[ids.length - 1] },
          })
          break
      }
      snapshots.push(snap(ctrl))
    }

    // undo all the way down, checking every intermediate state
    for (let i = snapshots.length - 1; i > 0; i--) {
      expect(snap(ctrl)).toBe(snapshots[i])
      expect(ctrl.undo()).not.toBeNull()
    }
    expect(snap(ctrl)).toBe(snapshots[0])
    expect(ctrl.history.canUndo).toBe(false)

    // redo all the way up
    for (let i = 1; i < snapshots.length; i++) {
      expect(ctrl.redo()).not.toBeNull()
      expect(snap(ctrl)).toBe(snapshots[i])
    }
    expect(ctrl.history.canRedo).toBe(false)
  })

  it("a new edit clears the redo stack", () => {
    const ctrl = new EditorController()
    ctrl.dispatch({ command: "scene.setBackground", args: { value: "#111" } })
    ctrl.dispatch({ command: "scene.setBackground", args: { value: "#222" } })
    ctrl.undo()
    expect(ctrl.history.canRedo).toBe(true)
    ctrl.dispatch({ command: "scene.setBackground", args: { value: "#333" } })
    expect(ctrl.history.canRedo).toBe(false)
    expect(ctrl.store.state.document.scene.background).toBe("#333")
  })

  it("undo restores selection alongside the document", () => {
    const ctrl = new EditorController()
    const r = ctrl.dispatch({
      command: "element.create",
      args: { html: "A" },
    })
    const id = r.returns[0] as string
    expect(ctrl.store.state.selection).toEqual([id])
    ctrl.dispatch({ command: "element.delete", args: { id } })
    expect(ctrl.store.state.selection).toEqual([])
    ctrl.undo() // back to created+selected
    expect(ctrl.store.state.selection).toEqual([id])
  })
})
