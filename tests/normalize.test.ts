// Normalize-gate table tests (eval lane 1): malformed / hostile / loose input
// → expected repair + warning, or batch abort. jsdom provides DOMParser for
// the HTML sanitizer.

import { describe, expect, it } from "vitest"
import {
  normalizeNode,
  normalizeScene,
  resolveNodeId,
} from "@/controller/normalize"
import { CommandAbort } from "@/controller/types"
import { emptyScene, node, rootNode } from "@/scene/model"
import { sanitizeCss, sanitizeHtml, sanitizeStylesheet } from "@/scene/validate"

describe("sanitizeHtml", () => {
  const cases: Array<{
    name: string
    input: string
    expect: (out: string, warnings: string[]) => void
  }> = [
    {
      name: "strips <script> but keeps its text out of markup",
      input: "Hello <script>alert(1)</script>world",
      expect: (out, w) => {
        expect(out).not.toContain("<script")
        expect(w.length).toBeGreaterThan(0)
      },
    },
    {
      name: "strips on* handlers",
      input: '<span onclick="steal()">Buy</span>',
      expect: (out, w) => {
        expect(out).toContain("<span>")
        expect(out).not.toContain("onclick")
        expect(w[0]).toMatch(/onclick/)
      },
    },
    {
      name: "blocks remote img src",
      input: '<img src="https://evil.example/x.png">',
      expect: (out, w) => {
        expect(out).not.toContain("evil.example")
        expect(w[0]).toMatch(/img src/)
      },
    },
    {
      name: "allows asset: img src",
      input: '<img src="asset:logo">',
      expect: (out, w) => {
        expect(out).toContain("asset:logo")
        expect(w).toHaveLength(0)
      },
    },
    {
      name: "keeps ordinary rich text intact",
      input: "Spring <em>Sale</em> — <strong>30%</strong> off",
      expect: (out, w) => {
        expect(out).toBe("Spring <em>Sale</em> — <strong>30%</strong> off")
        expect(w).toHaveLength(0)
      },
    },
    {
      name: "strips iframes entirely",
      input: '<iframe src="https://x.example"></iframe>after',
      expect: (out) => {
        expect(out).not.toContain("iframe")
        expect(out).toContain("after")
      },
    },
  ]
  for (const c of cases) {
    it(c.name, () => {
      const r = sanitizeHtml(c.input)
      c.expect(r.value, r.warnings)
    })
  }
})

describe("sanitizeCss", () => {
  it("drops position:fixed", () => {
    const r = sanitizeCss({ position: "fixed", color: "red" })
    expect(r.value).toEqual({ color: "red" })
    expect(r.warnings[0]).toMatch(/fixed/)
  })
  it("drops remote url() values, keeps asset:/data:", () => {
    const r = sanitizeCss({
      backgroundImage: "url(https://evil.example/x.png)",
      maskImage: "url('asset:blob')",
      borderImage: "url(data:image/png;base64,AAAA)",
    })
    expect(r.value.backgroundImage).toBeUndefined()
    expect(r.value.maskImage).toContain("asset:blob")
    expect(r.value.borderImage).toContain("data:image/png")
  })
})

describe("sanitizeStylesheet", () => {
  it("removes @import and remote url()", () => {
    const r = sanitizeStylesheet(
      "@import url('https://fonts.example/css'); .a { background: url(https://x.example/i.png); color: red }"
    )
    expect(r.value).not.toContain("@import")
    expect(r.value).not.toContain("x.example")
    expect(r.value).toContain("color: red")
    expect(r.warnings.length).toBeGreaterThanOrEqual(2)
  })
})

describe("normalizeNode", () => {
  it("seeds id/layout/css and recurses into children", () => {
    const n = normalizeNode({
      html: "Hi",
      children: [{ html: "child" }],
    } as never)
    expect(n.id).toBeTruthy()
    expect(n.layout.mode).toBe("absolute")
    // children win over html
    expect(n.html).toBeUndefined()
    expect(n.children).toHaveLength(1)
    expect(n.children![0].id).toBeTruthy()
  })
  it("replaces unsafe tags with div", () => {
    const warnings: string[] = []
    const n = normalizeNode({ tag: "iframe", html: "x" }, (w) =>
      warnings.push(w)
    )
    expect(n.tag).toBe("div")
    expect(warnings[0]).toMatch(/iframe/)
  })
})

describe("resolveNodeId", () => {
  const scene = emptyScene()
  scene.root = rootNode([
    node({ id: "headline_1", role: "headline", html: "H" }),
    node({ id: "cta_1", role: "cta", html: "C" }),
  ])

  it("resolves exact ids silently", () => {
    expect(resolveNodeId(scene, "cta_1", [])).toBe("cta_1")
  })
  it("resolves role names with a warning", () => {
    const w: string[] = []
    expect(resolveNodeId(scene, "headline", [], (m) => w.push(m))).toBe(
      "headline_1"
    )
    expect(w[0]).toMatch(/role/)
  })
  it("fuzzy-matches near-miss ids (edit distance ≤2)", () => {
    const w: string[] = []
    expect(resolveNodeId(scene, "cta_12", [], (m) => w.push(m))).toBe("cta_1")
    expect(w[0]).toMatch(/fuzzy/)
  })
  it("falls back to the selection when id is absent", () => {
    expect(resolveNodeId(scene, undefined, ["headline_1"])).toBe("headline_1")
  })
  it("aborts on garbage", () => {
    expect(() => resolveNodeId(scene, "zzzzzz", [])).toThrow(CommandAbort)
  })
})

describe("normalizeScene", () => {
  it("inherits missing parts from prev and forces fps=30", () => {
    const prev = emptyScene()
    prev.background = "#123"
    const out = normalizeScene({ timeline: { duration: 8, fps: 60 } }, prev)
    expect(out.background).toBe("#123")
    expect(out.timeline).toEqual({ duration: 8, fps: 30 })
  })
  it("re-roots a content node handed as root", () => {
    const prev = emptyScene()
    const w: string[] = []
    const out = normalizeScene(
      { root: { role: "headline", html: "Hi" } } as never,
      prev,
      (m) => w.push(m)
    )
    expect(out.root.id).toBe("root")
    expect(out.root.children).toHaveLength(1)
    expect(w[0]).toMatch(/wrapped/)
  })
  it("drops effect layers without an id and anims without preset/keys", () => {
    const prev = emptyScene()
    const w: string[] = []
    const out = normalizeScene(
      {
        effects: [{ params: { x: 1 } }, { effect: "glow" }],
        animations: [{ target: { type: "canvas" } }, { preset: "float" }],
      } as never,
      prev,
      (m) => w.push(m)
    )
    expect(out.effects).toHaveLength(1)
    expect(out.animations).toHaveLength(1)
    expect(w.length).toBe(2)
  })
})
