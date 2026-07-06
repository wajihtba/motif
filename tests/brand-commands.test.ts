// Brand command gate: brand.apply compiles the snapshot into theme tokens
// (merge vs replace-on-relink), component.insert instantiates on-brand, the
// legacy brandKit migrates, and the agent digest serializes the snapshot.

import { describe, expect, it } from "vitest"
import { EditorController } from "@/controller"
import { brandDigest } from "@/brand/digest"
import { snapshotFromKit } from "@/brand/compile"
import { migrateDocument } from "@/persistence/projects"
import { emptyDocument, findNode, flatten } from "@/scene/model"
import type { BrandKit, Document } from "@/scene/types"

describe("brand.apply", () => {
  it("merges fields and compiles tokens into the scene theme", () => {
    const ctrl = new EditorController()
    const r = ctrl.dispatch({
      command: "brand.apply",
      args: {
        palette: { "--primary": "oklch(0.7 0.2 40)" },
        fontHeading: "'Fraunces', serif",
        voice: "warm",
        components: { cta: { variants: { shape: "pill" } } },
        motion: { entrance: "popIn", pace: "snappy" },
      },
    })
    expect(r.ok).toBe(true)
    const doc = ctrl.store.state.document
    expect(doc.brand?.voice).toBe("warm")
    expect(doc.brand?.components.cta.variants?.shape).toBe("pill")
    expect(doc.brand?.motion.entrance).toBe("popIn")
    expect(doc.brand?.motion.stagger).toBe(0.12) // default filled
    expect(doc.scene.theme.tokens["--primary"]).toBe("oklch(0.7 0.2 40)")
    expect(doc.scene.theme.tokens["--font-heading"]).toBe("'Fraunces', serif")

    // second apply merges, keeps voice
    ctrl.dispatch({
      command: "brand.apply",
      args: { palette: { "--accent": "red" } },
    })
    const doc2 = ctrl.store.state.document
    expect(doc2.brand?.voice).toBe("warm")
    expect(doc2.brand?.tokens["--primary"]).toBe("oklch(0.7 0.2 40)")
  })

  it("linking a different brandId replaces the snapshot wholesale", () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "brand.apply",
      args: {
        brandId: "b1",
        voice: "old voice",
        components: { cta: { hidden: true } },
      },
    })
    ctrl.dispatch({
      command: "brand.apply",
      args: { brandId: "b2", palette: { "--primary": "blue" } },
    })
    const brand = ctrl.store.state.document.brand
    expect(brand?.brandId).toBe("b2")
    expect(brand?.voice).toBeUndefined() // b1's voice must not leak
    expect(brand?.components.cta).toBeUndefined()
  })
})

describe("component.insert", () => {
  it("inserts an on-brand instance (brand overrides applied) and selects it", () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "brand.apply",
      args: {
        components: {
          cta: { variants: { shape: "pill" }, css: { letterSpacing: "0.2em" } },
        },
      },
    })
    const r = ctrl.dispatch({
      command: "component.insert",
      args: { component: "cta", content: { label: "Buy now" } },
    })
    expect(r.ok).toBe(true)
    const id = ctrl.store.state.selection[0]
    const node = findNode(ctrl.store.state.document.scene, id)!
    expect(node.role).toBe("cta")
    expect(node.html).toBe("Buy now")
    expect(node.css.borderRadius).toBe("999px") // brand variant
    expect(node.css.letterSpacing).toBe("0.2em") // brand css patch
    expect(node.css.background).toBe("var(--primary)") // token-driven
  })

  it("call-level variants beat the brand override", () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "brand.apply",
      args: { components: { cta: { variants: { shape: "pill" } } } },
    })
    ctrl.dispatch({
      command: "component.insert",
      args: { component: "cta", variants: { shape: "square" } },
    })
    const id = ctrl.store.state.selection[0]
    const node = findNode(ctrl.store.state.document.scene, id)!
    expect(node.css.borderRadius).toBe("0px")
  })

  it("inserts composed components (card) with fresh unique ids", () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "component.insert",
      args: { component: "card-product", content: { price: "$99" } },
    })
    const scene = ctrl.store.state.document.scene
    const nodes = flatten(scene.root)
    expect(nodes.some((n) => n.role === "price" && n.html === "$99")).toBe(true)
    const ids = nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("aborts on an unknown component, listing valid ids", () => {
    const ctrl = new EditorController()
    const r = ctrl.dispatch({
      command: "component.insert",
      args: { component: "accordion" },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toContain("cta")
  })

  it("works without any brand (registry defaults)", () => {
    const ctrl = new EditorController()
    const r = ctrl.dispatch({
      command: "component.insert",
      args: { component: "tag" },
    })
    expect(r.ok).toBe(true)
  })
})

describe("legacy brandKit migration", () => {
  it("lifts brandKit into a BrandSnapshot and removes the old field", () => {
    const doc = emptyDocument() as Document & { brandKit?: BrandKit }
    doc.brandKit = {
      palette: { "--primary": "red" },
      fontHeading: "'Inter'",
      voice: "bold",
      logo: "asset:brand-logo",
    }
    migrateDocument(doc)
    expect(doc.brandKit).toBeUndefined()
    expect(doc.brand?.brandId).toBeUndefined()
    expect(doc.brand?.tokens["--primary"]).toBe("red")
    expect(doc.brand?.tokens["--font-heading"]).toBe("'Inter'")
    expect(doc.brand?.voice).toBe("bold")
    expect(doc.brand?.logo).toBe("asset:brand-logo")
  })

  it("does not overwrite an existing brand snapshot", () => {
    const doc = emptyDocument() as Document & { brandKit?: BrandKit }
    doc.brand = snapshotFromKit({ palette: { "--primary": "new" } })
    doc.brandKit = { palette: { "--primary": "old" } }
    migrateDocument(doc)
    expect(doc.brand.tokens["--primary"]).toBe("new")
  })
})

describe("brand digest (agent context)", () => {
  it("serializes non-default tokens, voice, motion, and overrides compactly", () => {
    const digest = brandDigest({
      tokens: { "--primary": "red", "--background": "#0a0a0f" }, // bg = default
      voice: "Warm.",
      components: {
        cta: { variants: { shape: "pill" }, css: { textTransform: "uppercase" } },
        "card-product": { hidden: true },
      },
      motion: { entrance: "riseIn", pace: "snappy", stagger: 0.1 },
    })
    expect(digest).toContain("--primary=red")
    expect(digest).not.toContain("--background") // default value elided
    expect(digest).toContain("voice: Warm.")
    expect(digest).toContain("entrance=riseIn")
    expect(digest).toContain("cta(shape=pill css:textTransform=uppercase)")
    expect(digest).toContain("card-product(hidden — do not use)")
  })
})
