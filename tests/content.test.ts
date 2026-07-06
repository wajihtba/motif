// M6 gate tests: looks apply through the normalize gate as owner-tagged
// bundles, variant overrides stay layout/visibility-only and resolve into
// derived scenes, and the brand kit compiles into theme tokens.

import { describe, expect, it } from "vitest"
import { EditorController } from "@/controller"
import { LOOKS } from "@/content/looks"
import { resolveForFormat } from "@/scene/variants"

function seeded(): EditorController {
  const ctrl = new EditorController()
  ctrl.dispatch([
    {
      command: "element.create",
      args: { node: { id: "headline", role: "headline", html: "Hi" } },
    },
    {
      command: "element.create",
      args: { node: { id: "cta", role: "cta", html: "Go" } },
    },
  ])
  return ctrl
}

describe("looks", () => {
  it("applies a look as owner-tagged layers; reapplying replaces", () => {
    const ctrl = seeded()
    const r = ctrl.dispatch({
      command: "look.apply",
      args: { name: "flashsale" },
    })
    expect(r.ok).toBe(true)
    const effects = ctrl.store.state.document.scene.effects
    expect(effects.length).toBeGreaterThan(2)
    expect(effects.every((l) => l.owner === "look")).toBe(true)

    ctrl.dispatch({ command: "look.apply", args: { name: "luxury" } })
    const after = ctrl.store.state.document.scene.effects
    expect(after.every((l) => l.owner === "look")).toBe(true)
    // it replaced, not stacked
    expect(after.map((l) => l.effect)).not.toEqual(effects.map((l) => l.effect))

    ctrl.dispatch({ command: "look.apply", args: { name: "none" } })
    expect(ctrl.store.state.document.scene.effects).toHaveLength(0)
  })

  it("rejects unknown looks with the catalog in the error", () => {
    const ctrl = seeded()
    const r = ctrl.dispatch({ command: "look.apply", args: { name: "nope" } })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain(LOOKS[0].name)
  })

  it("a look is one undoable step", () => {
    const ctrl = seeded()
    ctrl.dispatch({ command: "look.apply", args: { name: "cyberpunk" } })
    expect(ctrl.store.state.document.scene.effects.length).toBeGreaterThan(0)
    ctrl.undo()
    expect(ctrl.store.state.document.scene.effects).toHaveLength(0)
  })
})

describe("format variants", () => {
  it("override + resolve derives a scene without touching the canonical", () => {
    const ctrl = seeded()
    ctrl.dispatch({
      command: "variant.override",
      args: {
        format: "ig-story",
        id: "headline",
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: 0.3,
          width: "auto",
          height: "auto",
        },
      },
    })
    ctrl.dispatch({
      command: "variant.override",
      args: { format: "ig-story", id: "cta", hidden: true },
    })

    const doc = ctrl.store.state.document
    const story = resolveForFormat(doc, "ig-story")
    expect(story.baseWidth).toBe(1080)
    expect(story.baseHeight).toBe(1920)
    const headline = story.root.children!.find((c) => c.id === "headline")!
    expect(
      headline.layout.mode === "absolute" && headline.layout.dy
    ).toBeCloseTo(0.3)
    expect(story.root.children!.find((c) => c.id === "cta")!.hidden).toBe(true)

    // canonical untouched — content shared, layout unchanged
    const canonical = doc.scene
    const ch = canonical.root.children!.find((c) => c.id === "headline")!
    expect(ch.layout.mode === "absolute" && ch.layout.dy).not.toBeCloseTo(0.3)
    expect(
      canonical.root.children!.find((c) => c.id === "cta")!.hidden
    ).toBeUndefined()
  })

  it("content edits propagate to every format (variants cannot fork copy)", () => {
    const ctrl = seeded()
    ctrl.dispatch({
      command: "variant.override",
      args: { format: "og", id: "headline", hidden: false },
    })
    ctrl.dispatch({
      command: "element.setHtml",
      args: { id: "headline", html: "New copy" },
    })
    const og = resolveForFormat(ctrl.store.state.document, "og")
    expect(og.root.children!.find((c) => c.id === "headline")!.html).toBe(
      "New copy"
    )
  })

  it("variant.clear removes one node or the whole format", () => {
    const ctrl = seeded()
    ctrl.dispatch({
      command: "variant.override",
      args: { format: "pin", id: "headline", hidden: true },
    })
    ctrl.dispatch({
      command: "variant.clear",
      args: { format: "pin", id: "headline" },
    })
    expect(
      ctrl.store.state.document.formats.find((v) => v.format === "pin")
        ?.overrides.headline
    ).toBeUndefined()
    ctrl.dispatch({
      command: "variant.override",
      args: { format: "pin", id: "cta", hidden: true },
    })
    ctrl.dispatch({ command: "variant.clear", args: { format: "pin" } })
    expect(
      ctrl.store.state.document.formats.some((v) => v.format === "pin")
    ).toBe(false)
  })
})

describe("brand kit", () => {
  it("compiles palette + fonts into theme tokens and persists on the doc", () => {
    const ctrl = seeded()
    const r = ctrl.dispatch({
      command: "brand.apply",
      args: {
        palette: { "--primary": "oklch(0.7 0.2 40)", "--ink": "#fff8ee" },
        fontHeading: "'Fraunces', serif",
        voice: "warm, confident",
      },
    })
    expect(r.ok).toBe(true)
    const doc = ctrl.store.state.document
    expect(doc.brand?.voice).toBe("warm, confident")
    expect(doc.scene.theme.tokens["--primary"]).toBe("oklch(0.7 0.2 40)")
    expect(doc.scene.theme.tokens["--ink"]).toBe("#fff8ee")
    expect(doc.scene.theme.tokens["--font-heading"]).toBe("'Fraunces', serif")
  })
})
