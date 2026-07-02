// Command golden tests (eval lane 1): batches through the real dispatcher →
// expected document JSON. Also covers transactionality (atomic abort) and
// selection semantics.

import { beforeEach, describe, expect, it } from "vitest"
import { EditorController } from "@/controller"

function fresh(): EditorController {
  return new EditorController()
}

describe("dispatch basics", () => {
  let ctrl: EditorController
  beforeEach(() => {
    ctrl = fresh()
  })

  it("creates an element and returns its id", () => {
    const r = ctrl.dispatch({
      command: "element.create",
      args: { role: "headline", html: "Hello", id: undefined },
    })
    expect(r.ok).toBe(true)
    const id = r.returns[0] as string
    expect(id).toBeTruthy()
    const root = ctrl.store.state.document.scene.root
    expect(root.children).toHaveLength(1)
    expect(root.children![0].role).toBe("headline")
    // creation selects the new node
    expect(ctrl.store.state.selection).toEqual([id])
  })

  it('a batch is one history entry ("Applied N edits")', () => {
    const r = ctrl.dispatch([
      { command: "element.create", args: { role: "headline", html: "A" } },
      { command: "scene.setBackground", args: { value: "#000" } },
      { command: "theme.setToken", args: { key: "--primary", value: "red" } },
    ])
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(3)
    expect(r.entry).not.toBeNull()
    expect(ctrl.history.canUndo).toBe(true)
    ctrl.undo()
    const s = ctrl.store.state.document.scene
    expect(s.root.children ?? []).toHaveLength(0)
    expect(s.background).toBe("var(--background)")
  })

  it("aborts the whole batch on an unresolvable id (atomicity)", () => {
    const r = ctrl.dispatch([
      { command: "scene.setBackground", args: { value: "#222" } },
      { command: "element.setHtml", args: { id: "ghost_element", html: "x" } },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/unknown element/)
    // nothing applied — including the first, valid command
    expect(ctrl.store.state.document.scene.background).toBe("var(--background)")
    expect(ctrl.history.canUndo).toBe(false)
  })

  it("rejects unknown commands and malformed args", () => {
    expect(ctrl.dispatch({ command: "nope.nope" }).errors[0]).toMatch(
      /unknown command/
    )
    const bad = ctrl.dispatch({
      command: "element.setLayout",
      args: { layout: { mode: "orbit" } },
    })
    expect(bad.ok).toBe(false)
    expect(bad.errors[0]).toMatch(/invalid args/)
  })

  it("selection-only dispatches do not enter history", () => {
    ctrl.dispatch({ command: "element.create", args: { html: "A" } })
    const before = ctrl.history.top?.seq
    const r = ctrl.dispatch({ command: "element.select", args: { ids: null } })
    expect(r.ok).toBe(true)
    expect(r.entry).toBeNull()
    expect(ctrl.history.top?.seq).toBe(before)
    expect(ctrl.store.state.selection).toEqual([])
  })

  it("edits default to the selected node", () => {
    ctrl.dispatch({ command: "element.create", args: { html: "A" } })
    const r = ctrl.dispatch({
      command: "element.setStyle",
      args: { css: { color: "red" } },
    })
    expect(r.ok).toBe(true)
    expect(ctrl.store.state.document.scene.root.children![0].css.color).toBe(
      "red"
    )
  })

  it("sanitizes through the gate with warnings, not failures", () => {
    ctrl.dispatch({ command: "element.create", args: { html: "A" } })
    const r = ctrl.dispatch({
      command: "element.setHtml",
      args: { html: "Hi <script>x()</script>" },
    })
    expect(r.ok).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(
      ctrl.store.state.document.scene.root.children![0].html
    ).not.toContain("script")
  })

  it("brief.update merges by default and replaces on demand", () => {
    ctrl.dispatch({
      command: "brief.update",
      args: { brief: { goal: "spring sale", tone: "premium" } },
    })
    ctrl.dispatch({
      command: "brief.update",
      args: { brief: { audience: "gen z" } },
    })
    expect(ctrl.store.state.document.brief).toEqual({
      goal: "spring sale",
      tone: "premium",
      audience: "gen z",
    })
    ctrl.dispatch({
      command: "brief.update",
      args: { brief: { goal: "launch" }, replace: true },
    })
    expect(ctrl.store.state.document.brief).toEqual({ goal: "launch" })
  })

  it("scene.apply replaces the tree and clears selection", () => {
    ctrl.dispatch({ command: "element.create", args: { html: "old" } })
    const r = ctrl.dispatch({
      command: "scene.apply",
      args: {
        background: "linear-gradient(#000, #111)",
        root: {
          id: "root",
          role: "group",
          children: [
            { id: "h1", role: "headline", html: "New <em>scene</em>" },
            { id: "cta", role: "cta", html: "Go" },
          ],
        },
      },
    })
    expect(r.ok).toBe(true)
    const scene = ctrl.store.state.document.scene
    expect(scene.root.children!.map((c) => c.id)).toEqual(["h1", "cta"])
    expect(scene.background).toContain("linear-gradient")
    expect(ctrl.store.state.selection).toEqual([])
  })

  it("duplicate clones a subtree with fresh ids", () => {
    ctrl.dispatch({
      command: "element.create",
      args: {
        node: {
          id: "card",
          role: "group",
          children: [{ id: "inner", html: "x" }],
        },
      },
    })
    const r = ctrl.dispatch({
      command: "element.duplicate",
      args: { id: "card" },
    })
    const newId = r.returns[0] as string
    expect(newId).not.toBe("card")
    const kids = ctrl.store.state.document.scene.root.children!
    expect(kids).toHaveLength(2)
    expect(kids[1].children![0].id).not.toBe("inner")
  })
})
