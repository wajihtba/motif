// Brand component registry — every def builds, token references are declared,
// instantiate's merge order holds, and instances get fresh ids.

import { describe, expect, it } from "vitest"
import type { SceneNode } from "../src/scene/types"
import {
  componentCatalogLine,
  componentIdList,
  defaultVariants,
  get,
  groups,
  instantiate,
  list,
} from "../src/brand/components"
import { walk } from "../src/scene/model"
import { DEFAULT_THEME } from "../src/scene/theme"
import { compileBrand, snapshotFromKit } from "../src/brand/compile"
import type { Brand } from "../src/brand/types"

function collectNodes(root: SceneNode): SceneNode[] {
  const out: SceneNode[] = []
  walk(root, (n) => {
    out.push(n)
  })
  return out
}

/** Every var(--x) referenced anywhere in the subtree's css/html. */
function tokensReferenced(root: SceneNode): Set<string> {
  const out = new Set<string>()
  const scan = (text: string) => {
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)/gi)) out.add(m[1])
  }
  for (const n of collectNodes(root)) {
    for (const v of Object.values(n.css)) scan(v)
    if (n.html) scan(n.html)
  }
  return out
}

describe("brand component registry", () => {
  it("registers a non-empty catalog with unique ids", () => {
    const defs = list()
    expect(defs.length).toBeGreaterThanOrEqual(60)
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length)
    expect(groups().length).toBeGreaterThanOrEqual(11)
  })

  it("every def builds without throwing, at defaults and all variant options", () => {
    for (const def of list()) {
      const base = instantiate(def.id)
      expect(base, def.id).toBeDefined()
      expect(base!.warnings).toEqual([])
      for (const axis of def.variants ?? []) {
        for (const option of axis.options) {
          const r = instantiate(def.id, { variants: { [axis.key]: option.id } })
          expect(r, `${def.id}.${axis.key}=${option.id}`).toBeDefined()
          expect(r!.warnings).toEqual([])
        }
      }
    }
  })

  it("every token referenced is declared in tokensUsed and exists in the theme", () => {
    for (const def of list()) {
      // Reference every axis's non-default options too — patches add tokens.
      const results = [instantiate(def.id)!]
      for (const axis of def.variants ?? [])
        for (const option of axis.options)
          results.push(instantiate(def.id, { variants: { [axis.key]: option.id } })!)
      const used = new Set<string>()
      for (const r of results)
        for (const t of tokensReferenced(r.node)) used.add(t)
      for (const token of used) {
        expect(def.tokensUsed, `${def.id} references ${token}`).toContain(token)
        expect(
          DEFAULT_THEME.tokens[token],
          `${token} missing from DEFAULT_THEME`
        ).toBeDefined()
      }
    }
  })

  it("merge order: call css beats brand override css beats variant css", () => {
    const r = instantiate("cta", {
      variants: { shape: "pill" }, // borderRadius: 999px
      override: { css: { borderRadius: "4px", background: "red" } },
      css: { background: "blue" },
    })!
    expect(r.node.css.borderRadius).toBe("4px") // override beats variant
    expect(r.node.css.background).toBe("blue") // call beats override
  })

  it("brand override variants apply, call-level variants win", () => {
    const fromOverride = instantiate("cta", {
      override: { variants: { shape: "pill" } },
    })!
    expect(fromOverride.node.css.borderRadius).toBe("999px")
    const callWins = instantiate("cta", {
      override: { variants: { shape: "pill" } },
      variants: { shape: "square" },
    })!
    expect(callWins.node.css.borderRadius).toBe("0px")
  })

  it("unknown component returns undefined; unknown variant warns and falls back", () => {
    expect(instantiate("accordion")).toBeUndefined()
    const r = instantiate("cta", { variants: { shape: "blob" } })!
    expect(r.warnings.some((w) => w.includes("blob"))).toBe(true)
    expect(r.node.css.borderRadius).toBe("var(--radius)") // default shape
  })

  it("instances get fresh unique ids — part names never enter the scene", () => {
    const a = instantiate("card-product")!
    const b = instantiate("card-product")!
    const idsA = collectNodes(a.node).map((n) => n.id)
    const idsB = collectNodes(b.node).map((n) => n.id)
    expect(new Set(idsA).size).toBe(idsA.length)
    for (const id of idsA) {
      expect(idsB).not.toContain(id)
      expect(["surface", "label", "photo", "price", "cta", "name"]).not.toContain(id)
    }
  })

  it("css patches are sanitized (url() dropped with a warning)", () => {
    const r = instantiate("cta", {
      css: { background: "url(https://evil.example/x.png)" },
    })!
    expect(r.node.css.background).toBe("var(--primary)")
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it("slot content lands in the built html", () => {
    const r = instantiate("cta", { content: { label: "Buy today" } })!
    expect(r.node.html).toBe("Buy today")
    const listR = instantiate("list", { content: { items: "One\nTwo" } })!
    expect(listR.node.html).toContain("One")
    expect(listR.node.html).toContain("Two")
    expect(listR.node.html!.match(/<li/g)?.length).toBe(2)
  })

  it("digest helpers are stable and cover the catalog", () => {
    expect(componentIdList()).toContain("cta")
    expect(componentIdList()).toContain("card-product")
    const line = componentCatalogLine(get("cta")!)
    expect(line).toContain('cta "CTA Button" [Actions]')
    expect(line).toContain("slots:label")
    expect(line).toContain("shape(square|rounded|pill)")
  })

  it("defaultVariants picks the declared default over options[0]", () => {
    expect(defaultVariants(get("cta")!).shape).toBe("rounded")
    expect(defaultVariants(get("cta")!).size).toBe("md")
  })
})

describe("brand compile", () => {
  it("compileBrand snapshots tokens, components, and motion with defaults", () => {
    const brand: Brand = {
      id: "b1",
      name: "Acme",
      version: 1,
      theme: structuredClone(DEFAULT_THEME),
      voice: "Warm.",
      components: { cta: { variants: { shape: "pill" } } },
      motion: { entrance: "popIn" },
      createdAt: 1,
      updatedAt: 2,
    }
    const snap = compileBrand(brand)
    expect(snap.brandId).toBe("b1")
    expect(snap.syncedAt).toBe(2)
    expect(snap.tokens["--primary"]).toBe(DEFAULT_THEME.tokens["--primary"])
    expect(snap.components.cta.variants?.shape).toBe("pill")
    expect(snap.motion.entrance).toBe("popIn")
    expect(snap.motion.pace).toBe("standard") // default filled
  })

  it("snapshotFromKit lifts legacy kits (palette + fonts, no brandId)", () => {
    const snap = snapshotFromKit({
      palette: { "--primary": "red", notAToken: "x" },
      fontHeading: "'Inter'",
      voice: "Bold.",
    })
    expect(snap.brandId).toBeUndefined()
    expect(snap.tokens["--primary"]).toBe("red")
    expect(snap.tokens.notAToken).toBeUndefined()
    expect(snap.tokens["--font-heading"]).toBe("'Inter'")
    expect(snap.voice).toBe("Bold.")
  })
})
