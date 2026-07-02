// fx.* command gate (eval lane 1): registry-aware normalization — unknown
// effects abort, params clamp with warnings, canvas-only effects retarget,
// custom GLSL requires a frag and round-trips compiler logs from the
// injected validator.

import { afterEach, describe, expect, it } from "vitest"
import { EditorController } from "@/controller"
import { setGlslValidator } from "@/controller/normalize"

function withHero(): EditorController {
  const ctrl = new EditorController()
  ctrl.dispatch({
    command: "element.create",
    args: { node: { id: "hero", role: "image", html: "" } },
  })
  return ctrl
}

afterEach(() => setGlslValidator(null))

describe("fx commands", () => {
  it("adds a known element shader with seeded + clamped params", () => {
    const ctrl = withHero()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "neon",
        target: { type: "elements", ids: ["hero"] },
        params: { glow: 9999 },
      },
    })
    expect(r.ok).toBe(true)
    const layer = ctrl.store.state.document.scene.effects[0]
    expect(layer.effect).toBe("neon")
    expect(layer.kind).toBe("element-shader")
    // every declared param is seeded, provided value clamped to range
    for (const v of Object.values(layer.params)) {
      expect(Number.isFinite(v)).toBe(true)
    }
    expect(r.warnings.some((w) => w.includes("clamped"))).toBe(true)
  })

  it("rejects unknown effects atomically", () => {
    const ctrl = withHero()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "definitely-not-real" },
    })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/unknown effect/)
    expect(ctrl.store.state.document.scene.effects).toHaveLength(0)
  })

  it("scene shaders coerce element targets back to canvas", () => {
    const ctrl = withHero()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "vhs",
        kind: "scene-shader",
        target: { type: "elements", ids: ["hero"] },
      },
    })
    expect(r.ok).toBe(true)
    expect(ctrl.store.state.document.scene.effects[0].target).toEqual({
      type: "canvas",
    })
    expect(r.warnings.some((w) => w.includes("canvas-only"))).toBe(true)
  })

  it("defaults the target to the current selection", () => {
    const ctrl = withHero() // element.create selected hero
    const r = ctrl.dispatch({ command: "fx.add", args: { effect: "neon" } })
    expect(r.ok).toBe(true)
    expect(ctrl.store.state.document.scene.effects[0].target).toEqual({
      type: "elements",
      ids: ["hero"],
    })
  })

  it("custom GLSL: missing frag aborts; validator log round-trips", () => {
    const ctrl = withHero()
    const missing = ctrl.dispatch({ command: "fx.add", args: { effect: "custom" } })
    expect(missing.ok).toBe(false)
    expect(missing.errors[0]).toMatch(/requires a GLSL frag/)

    setGlslValidator((_kind, frag) =>
      frag.includes("boom") ? "ERROR: 0:3 'boom' : undeclared identifier" : null
    )
    const bad = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "custom", frag: "vec4 fx(){ return boom; }" },
    })
    expect(bad.ok).toBe(false)
    expect(bad.errors[0]).toMatch(/undeclared identifier/)

    const good = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "custom", frag: "vec4 fx(){ return texture2D(u_tex, v_uv); }" },
    })
    expect(good.ok).toBe(true)
    expect(ctrl.store.state.document.scene.effects[0].frag).toContain("texture2D")
  })

  it("update merges params through the gate; reorder and remove work", () => {
    const ctrl = withHero()
    const id = ctrl.dispatch({ command: "fx.add", args: { effect: "neon" } })
      .returns[0] as string
    const id2 = ctrl.dispatch({ command: "fx.add", args: { effect: "glitch" } })
      .returns[0] as string

    ctrl.dispatch({
      command: "fx.update",
      args: { id, patch: { enabled: false } },
    })
    expect(ctrl.store.state.document.scene.effects[0].enabled).toBe(false)

    ctrl.dispatch({
      command: "fx.reorder",
      args: { id: id2, direction: "up" },
    })
    expect(ctrl.store.state.document.scene.effects[0].id).toBe(id2)

    ctrl.dispatch({ command: "fx.remove", args: { id } })
    expect(ctrl.store.state.document.scene.effects).toHaveLength(1)
  })

  it("effect-targeted nodes become paint units (split rule)", async () => {
    const { unitRootIds } = await import("@/engine/html-canvas/paint-units")
    const ctrl = withHero()
    ctrl.dispatch({
      command: "fx.add",
      args: { effect: "neon", target: { type: "elements", ids: ["hero"] } },
    })
    const roots = unitRootIds(ctrl.store.state.document.scene)
    expect([...roots]).toContain("hero")
  })
})
