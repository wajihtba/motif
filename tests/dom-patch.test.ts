// Incremental DOM patching (M1-b verify): a scripted dispatch batch mutates
// the engine's DOM copies with counted, scoped operations — no full rebuild.
// jsdom has no 2d context or real layout, but the DOM-writing half of the
// backend runs fully; painting no-ops.

import { beforeEach, describe, expect, it } from "vitest"
import { EditorController } from "@/controller"
import { HtmlCanvasBackend } from "@/engine/html-canvas"

let ctrl: EditorController
let backend: HtmlCanvasBackend

function mutationCounts(records: MutationRecord[]) {
  let childList = 0
  let attributes = 0
  for (const r of records) {
    if (r.type === "childList")
      childList += r.addedNodes.length + r.removedNodes.length
    if (r.type === "attributes") attributes += 1
  }
  return { childList, attributes }
}

describe("incremental dom-patch", () => {
  let observer: MutationObserver

  beforeEach(() => {
    document.body.innerHTML = ""
    ctrl = new EditorController()
    backend = new HtmlCanvasBackend()
    const host = document.createElement("div")
    document.body.appendChild(host)
    backend.mount(host)
    ctrl.attachBackend(backend)
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "h1", role: "headline", html: "Hello" } },
      },
      {
        command: "element.create",
        args: { node: { id: "cta", role: "cta", html: "Go" } },
      },
    ])
    observer = new MutationObserver(() => {})
    observer.observe(backend.canvas, {
      subtree: true,
      childList: true,
      attributes: true,
    })
  })

  it("style edits patch attributes in place — zero childList churn", () => {
    const rootUnitBefore = backend.canvas.querySelector('[data-id="root"]')
    ctrl.dispatch({
      command: "element.setStyle",
      args: { id: "h1", css: { color: "red", fontSize: "80px" } },
    })
    const records = observer.takeRecords()
    const { childList, attributes } = mutationCounts(records)
    expect(childList).toBe(0)
    expect(attributes).toBeGreaterThan(0)
    // every attribute mutation is scoped to the restyled element
    const targets = new Set(records.map((r) => r.target))
    expect(targets.size).toBe(1)
    // same root unit element — no rebuild
    expect(backend.canvas.querySelector('[data-id="root"]')).toBe(
      rootUnitBefore
    )
    // and the style actually landed
    const el = backend.canvas.querySelector<HTMLElement>('[data-id="h1"]')!
    expect(el.style.color).toBe("red")
  })

  it("content edits rebuild exactly one subtree", () => {
    const rootUnitBefore = backend.canvas.querySelector('[data-id="root"]')
    const ctaBefore = backend.canvas.querySelector('[data-id="cta"]')
    ctrl.dispatch({
      command: "element.setHtml",
      args: { id: "h1", html: "New <em>copy</em>" },
    })
    const { childList } = mutationCounts(observer.takeRecords())
    // one removal + one insertion for the swapped subtree
    expect(childList).toBe(2)
    expect(backend.canvas.querySelector('[data-id="root"]')).toBe(
      rootUnitBefore
    )
    expect(backend.canvas.querySelector('[data-id="cta"]')).toBe(ctaBefore)
    expect(backend.canvas.querySelector('[data-id="h1"]')!.innerHTML).toContain(
      "<em>copy</em>"
    )
  })

  it("element.create touches only the parent", () => {
    const rootUnitBefore = backend.canvas.querySelector('[data-id="root"]')
    ctrl.dispatch({
      command: "element.create",
      args: { node: { id: "badge", role: "badge", html: "-30%" } },
    })
    // parent (root) is rebuilt as one subtree swap
    const { childList } = mutationCounts(observer.takeRecords())
    expect(childList).toBeLessThanOrEqual(2)
    expect(backend.canvas.querySelector('[data-id="badge"]')).not.toBeNull()
    // root was the rebuilt parent — allowed to be a fresh element
    void rootUnitBefore
  })

  it("undo applies inverse patches incrementally too", () => {
    ctrl.dispatch({
      command: "element.setStyle",
      args: { id: "h1", css: { color: "blue" } },
    })
    observer.takeRecords()
    ctrl.undo()
    const { childList } = mutationCounts(observer.takeRecords())
    expect(childList).toBe(0) // style-only undo — attribute patch, no rebuild
    const el = backend.canvas.querySelector<HTMLElement>('[data-id="h1"]')!
    expect(el.style.color).not.toBe("blue")
  })

  it("theme/background edits restyle without touching the tree", () => {
    ctrl.dispatch([
      { command: "theme.setToken", args: { key: "--primary", value: "lime" } },
      { command: "scene.setBackground", args: { value: "#101010" } },
    ])
    const { childList } = mutationCounts(observer.takeRecords())
    expect(childList).toBe(0)
    expect(backend.canvas.style.getPropertyValue("--primary")).toBe("lime")
  })

  it("adding an animation (unit split change) recompiles the unit list", () => {
    ctrl.dispatch({
      command: "scene.apply",
      args: {
        animations: [
          {
            id: "a1",
            preset: "float",
            target: { type: "elements", ids: ["h1"] },
          },
        ],
      },
    })
    // h1 became its own paint unit (immediate canvas child), and the root
    // unit keeps a hidden hole in its place
    const unitEl = [...backend.canvas.children].find(
      (c) => (c as HTMLElement).dataset.id === "h1"
    )
    expect(unitEl).toBeTruthy()
    expect(backend.canvas.querySelector('[data-hole="h1"]')).not.toBeNull()
  })
})
