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
    const missing = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "custom" },
    })
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
      args: {
        effect: "custom",
        frag: "vec4 fx(){ return texture2D(u_tex, v_uv); }",
      },
    })
    expect(good.ok).toBe(true)
    expect(ctrl.store.state.document.scene.effects[0].frag).toContain(
      "texture2D"
    )
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

// --- placement policy + full-frame exclusion (effects overhaul) --------------

describe("effect placement policy & exclude", () => {
  function withContent(): EditorController {
    const ctrl = new EditorController()
    ctrl.dispatch([
      {
        command: "element.create",
        args: { node: { id: "photo", role: "image", html: "" } },
      },
      {
        command: "element.create",
        args: { node: { id: "title", role: "headline", html: "Big sale" } },
      },
      {
        command: "element.create",
        args: { node: { id: "buy", role: "cta", html: "Buy now" } },
      },
    ])
    return ctrl
  }

  it("seeds the policy default exclude on destructive full-frame effects", () => {
    const ctrl = withContent()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "dithering", kind: "scene-shader" },
    })
    expect(r.ok).toBe(true)
    const layer = ctrl.store.state.document.scene.effects[0]
    expect(layer.exclude?.roles).toContain("headline")
    expect(layer.exclude?.roles).toContain("cta")
    expect(r.warnings.some((w) => w.includes("protecting"))).toBe(true)
  })

  it("respects an explicit empty exclude as opt-out (no re-seed)", () => {
    const ctrl = withContent()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "dithering",
        kind: "scene-shader",
        exclude: { roles: [] },
      },
    })
    expect(r.ok).toBe(true)
    const id = r.returns[0] as string
    expect(
      ctrl.store.state.document.scene.effects[0].exclude?.roles
    ).toEqual([])
    expect(r.warnings.some((w) => w.includes("protecting"))).toBe(false)

    // A later unrelated update must NOT re-seed the default protection.
    const upd = ctrl.dispatch({
      command: "fx.update",
      args: { id, patch: { params: { cell: 4 } } },
    })
    expect(upd.ok).toBe(true)
    expect(
      ctrl.store.state.document.scene.effects[0].exclude?.roles
    ).toEqual([])
  })

  it("drops exclude on element-target layers with a warning", () => {
    const ctrl = withContent()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "neon",
        target: { type: "elements", ids: ["photo"] },
        exclude: { roles: ["headline"] },
      },
    })
    expect(r.ok).toBe(true)
    expect(ctrl.store.state.document.scene.effects[0].exclude).toBeUndefined()
    expect(r.warnings.some((w) => w.includes("exclude only applies"))).toBe(
      true
    )
  })

  it("drops unknown exclude ids with a warning, keeps known ones", () => {
    const ctrl = withContent()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "dithering",
        kind: "scene-shader",
        exclude: { ids: ["photo", "ghost-node"] },
      },
    })
    expect(r.ok).toBe(true)
    const layer = ctrl.store.state.document.scene.effects[0]
    expect(layer.exclude?.ids).toEqual(["photo"])
    expect(r.warnings.some((w) => w.includes("ghost-node"))).toBe(true)
  })

  it("enforces denyRoles from a def's policy on role and id targets", async () => {
    const { register } = await import("@/effects/core/registry")
    register({
      kind: "element-shader",
      id: "test-no-cta",
      name: "Test",
      group: "Test",
      animated: false,
      animateByDefault: false,
      maskable: false,
      params: [],
      frag: "vec4 fx(){ return vec4(1.0); }",
      policy: { denyRoles: ["cta"] },
    })
    const ctrl = withContent()
    // Role-target INPUT resolves to concrete ids at the gate, so the deny
    // check lands on the resolved elements.
    const byRole = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "test-no-cta", target: { type: "role", role: "cta" } },
    })
    expect(byRole.ok).toBe(false)
    expect(byRole.errors[0]).toMatch(/role policy/)

    const byId = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "test-no-cta", target: { type: "elements", ids: ["buy"] } },
    })
    expect(byId.ok).toBe(false)
    expect(byId.errors[0]).toMatch(/role policy/)

    // Mixed ids: denied ones are stripped, allowed ones survive.
    const mixed = ctrl.dispatch({
      command: "fx.add",
      args: {
        effect: "test-no-cta",
        target: { type: "elements", ids: ["buy", "photo"] },
      },
    })
    expect(mixed.ok).toBe(true)
    const layer = ctrl.store.state.document.scene.effects.at(-1)!
    expect(layer.target).toEqual({ type: "elements", ids: ["photo"] })
  })

  it("drops effects disabled by config/policy", async () => {
    const { register } = await import("@/effects/core/registry")
    register({
      kind: "element-shader",
      id: "test-disabled",
      name: "Test off",
      group: "Test",
      animated: false,
      animateByDefault: false,
      maskable: false,
      params: [],
      frag: "vec4 fx(){ return vec4(1.0); }",
      policy: { enabled: false },
    })
    const ctrl = withContent()
    const r = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "test-disabled", target: { type: "elements", ids: ["photo"] } },
    })
    expect(r.ok).toBe(false)
    expect(ctrl.store.state.document.scene.effects).toHaveLength(0)
  })

  it("excluded nodes become protected paint units above the scene chain", async () => {
    const { protectedIds, planEffects } = await import("@/engine/effect-plan")
    const { unitRootIds } = await import("@/engine/html-canvas/paint-units")
    const ctrl = withContent()
    ctrl.dispatch({
      command: "fx.add",
      args: { effect: "dithering", kind: "scene-shader" }, // seeds text/cta protection
    })
    const scene = ctrl.store.state.document.scene
    const prot = protectedIds(scene)
    expect(prot.has("title")).toBe(true)
    expect(prot.has("buy")).toBe(true)
    expect(prot.has("photo")).toBe(false) // image not in default excludes
    expect(planEffects(scene).protected).toEqual(prot)
    // and the split rule isolates them so the compositor can defer them
    const roots = unitRootIds(scene)
    expect(roots.has("title")).toBe(true)
    expect(roots.has("buy")).toBe(true)
  })

  it("disabled layers protect nothing", async () => {
    const { protectedIds } = await import("@/engine/effect-plan")
    const ctrl = withContent()
    const id = ctrl.dispatch({
      command: "fx.add",
      args: { effect: "dithering", kind: "scene-shader" },
    }).returns[0] as string
    ctrl.dispatch({
      command: "fx.update",
      args: { id, patch: { enabled: false } },
    })
    expect(protectedIds(ctrl.store.state.document.scene).size).toBe(0)
  })
})
