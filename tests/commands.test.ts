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

describe("layout assist", () => {
  let ctrl: EditorController
  beforeEach(() => {
    ctrl = fresh()
  })

  const absAt = (dy: number) => ({
    mode: "absolute" as const,
    anchor: "top-left" as const,
    dx: 0.1,
    dy,
    width: 0.8,
    height: 0.1,
  })

  it("element.setAllowOverlap round-trips (and normalize keeps the flag)", () => {
    ctrl.dispatch({
      command: "element.create",
      args: {
        node: { id: "h1", role: "headline", html: "Hi", allowOverlap: true },
      },
    })
    const nodeOf = () =>
      ctrl.store.state.document.scene.root.children!.find((c) => c.id === "h1")!
    expect(nodeOf().allowOverlap).toBe(true)

    ctrl.dispatch({
      command: "element.setAllowOverlap",
      args: { id: "h1", allow: false },
    })
    expect(nodeOf().allowOverlap).toBeUndefined()

    ctrl.dispatch({
      command: "element.setAllowOverlap",
      args: { id: "h1", allow: true },
    })
    expect(nodeOf().allowOverlap).toBe(true)
  })

  it("layout.stackify wraps siblings into a stack ordered by position", () => {
    // created intentionally out of visual order
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "b", html: "middle", layout: absAt(0.5) } },
      },
      {
        command: "element.create",
        args: { node: { id: "a", html: "top", layout: absAt(0.1) } },
      },
      {
        command: "element.create",
        args: { node: { id: "c", html: "bottom", layout: absAt(0.8) } },
      },
    ])
    const r = ctrl.dispatch({
      command: "layout.stackify",
      args: { ids: ["a", "b", "c"], direction: "column", gap: 20 },
    })
    expect(r.ok).toBe(true)
    const groupId = r.returns[0] as string

    const root = ctrl.store.state.document.scene.root
    expect(root.children).toHaveLength(1)
    const group = root.children![0]
    expect(group.id).toBe(groupId)
    expect(group.layout.mode).toBe("stack")
    // sorted by y, all converted to flow
    expect(group.children!.map((c) => c.id)).toEqual(["a", "b", "c"])
    expect(group.children!.every((c) => c.layout.mode === "flow")).toBe(true)
    expect(ctrl.store.state.selection).toEqual([groupId])

    // one undo restores the flat absolute siblings
    ctrl.undo()
    const restored = ctrl.store.state.document.scene.root.children!
    expect(restored.map((c) => c.id)).toEqual(["b", "a", "c"])
    expect(restored.every((c) => c.layout.mode === "absolute")).toBe(true)
  })

  it("layout.stackify aborts unless all ids share one parent", () => {
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "a", html: "x", layout: absAt(0.1) } },
      },
      {
        command: "element.create",
        args: {
          node: {
            id: "wrap",
            role: "group",
            children: [{ id: "inner", html: "y" }],
          },
        },
      },
    ])
    const r = ctrl.dispatch({
      command: "layout.stackify",
      args: { ids: ["a", "inner"] },
    })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/share one parent/)
    // atomic: nothing changed
    expect(ctrl.store.state.document.scene.root.children).toHaveLength(2)
  })
})

describe("align & distribute", () => {
  let ctrl: EditorController
  beforeEach(() => {
    ctrl = fresh()
  })

  const absBox = (dx: number, dy: number, w = 0.2, h = 0.1) => ({
    mode: "absolute" as const,
    anchor: "top-left" as const,
    dx,
    dy,
    width: w,
    height: h,
  })
  const layoutOf = (id: string) => {
    const n = ctrl.store.state.document.scene.root.children!.find(
      (c) => c.id === id
    )!
    return n.layout as {
      dx: number
      dy: number
      anchor: string
      width: unknown
    }
  }

  it("layout.align left moves siblings to the leftmost edge, keeping sizes", () => {
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "a", html: "a", layout: absBox(0.1, 0.1) } },
      },
      {
        command: "element.create",
        args: { node: { id: "b", html: "b", layout: absBox(0.3, 0.3) } },
      },
      {
        command: "element.create",
        args: { node: { id: "c", html: "c", layout: absBox(0.5, 0.5) } },
      },
    ])
    const r = ctrl.dispatch({
      command: "layout.align",
      args: { ids: ["a", "b", "c"], edge: "left" },
    })
    expect(r.ok).toBe(true)
    expect(layoutOf("a").dx).toBe(0.1)
    expect(layoutOf("b").dx).toBe(0.1)
    expect(layoutOf("c").dx).toBe(0.1)
    // untouched: vertical positions, anchor, size
    expect(layoutOf("b").dy).toBe(0.3)
    expect(layoutOf("b").anchor).toBe("top-left")
    expect(layoutOf("b").width).toBe(0.2)
  })

  it("layout.distribute vertical spreads the middles evenly", () => {
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "a", html: "a", layout: absBox(0.1, 0) } },
      },
      {
        command: "element.create",
        args: { node: { id: "b", html: "b", layout: absBox(0.1, 0.2) } },
      },
      {
        command: "element.create",
        args: { node: { id: "c", html: "c", layout: absBox(0.1, 0.7) } },
      },
    ])
    const r = ctrl.dispatch({
      command: "layout.distribute",
      args: { ids: ["a", "b", "c"], direction: "vertical" },
    })
    expect(r.ok).toBe(true)
    // first & last fixed; middle centered in the free space: (0+0.1 → 0.7)
    // inner 0.6*1080, middle h 0.1*1080 → gap 270px → y 378px → dy 0.35
    expect(layoutOf("a").dy).toBe(0)
    expect(layoutOf("b").dy).toBe(0.35)
    expect(layoutOf("c").dy).toBe(0.7)
  })

  it("layout.distribute with a fixed gap packs from the first", () => {
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "a", html: "a", layout: absBox(0.1, 0) } },
      },
      {
        command: "element.create",
        args: { node: { id: "b", html: "b", layout: absBox(0.1, 0.5) } },
      },
      {
        command: "element.create",
        args: { node: { id: "c", html: "c", layout: absBox(0.1, 0.9) } },
      },
    ])
    ctrl.dispatch({
      command: "layout.distribute",
      args: { ids: ["a", "b", "c"], direction: "vertical", gap: 0 },
    })
    expect(layoutOf("a").dy).toBe(0)
    expect(layoutOf("b").dy).toBe(0.1)
    expect(layoutOf("c").dy).toBe(0.2)
  })

  it("layout.align aborts on flow children (no positions to align)", () => {
    ctrl.dispatch({
      command: "element.create",
      args: {
        node: {
          id: "col",
          role: "group",
          layout: {
            mode: "stack",
            direction: "column",
            gap: 8,
            align: "center",
            justify: "start",
          },
          children: [
            { id: "a", html: "a", layout: { mode: "flow" } },
            { id: "b", html: "b", layout: { mode: "flow" } },
          ],
        },
      },
    })
    const r = ctrl.dispatch({
      command: "layout.align",
      args: { ids: ["a", "b"], edge: "left" },
    })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/positioned siblings/)
  })
})
