// Partial-JSON parser (eval lane 1): byte-truncation fuzz — the parser must
// never throw at ANY prefix of a real scene payload, and must recover a
// usable object once meaningful structure has streamed.

import { describe, expect, it } from "vitest"
import { parsePartialJson } from "@/agent/partial-json"

const SCENE = JSON.stringify({
  background: "linear-gradient(180deg, #101 0%, #000 100%)",
  theme: { tokens: { "--primary": "oklch(0.7 0.2 200)" } },
  root: {
    id: "root",
    children: [
      {
        id: "headline",
        role: "headline",
        html: 'Big <em>Sale</em> — "50%" off\\nnow',
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: 0.1,
          width: "auto",
          height: "auto",
        },
        css: { fontSize: "120px", color: "var(--ink)" },
      },
      { id: "cta", role: "cta", html: "Shop now", css: { padding: "12px" } },
      { id: "badge", role: "badge", html: "−50%", css: {} },
    ],
  },
})

describe("parsePartialJson", () => {
  it("parses complete JSON exactly", () => {
    expect(parsePartialJson(SCENE)).toEqual(JSON.parse(SCENE))
  })

  it("never throws at any truncation offset", () => {
    for (let i = 0; i <= SCENE.length; i++) {
      expect(() => parsePartialJson(SCENE.slice(0, i))).not.toThrow()
    }
  })

  it("recovers an object for the vast majority of prefixes", () => {
    let recovered = 0
    let total = 0
    for (let i = 10; i <= SCENE.length; i++) {
      total++
      const v = parsePartialJson(SCENE.slice(0, i))
      if (v && typeof v === "object") recovered++
    }
    expect(recovered / total).toBeGreaterThan(0.9)
  })

  it("holds back the truncated child (progressive semantics)", () => {
    // cut in the middle of the second child
    const cut = SCENE.indexOf('"cta"') + 8
    const v = parsePartialJson(SCENE.slice(0, cut)) as {
      root?: { children?: unknown[] }
    }
    expect(v).toBeTruthy()
    const children = v.root?.children ?? []
    // first child fully present
    expect((children[0] as { id?: string }).id).toBe("headline")
  })

  it("repairs dangling strings, commas and colons", () => {
    expect(parsePartialJson('{"a": "hel')).toEqual({ a: "hel" })
    expect(parsePartialJson('{"a": 1,')).toEqual({ a: 1 })
    expect(parsePartialJson('{"a":')).toEqual({})
    expect(parsePartialJson('{"a": [1, 2,')).toEqual({ a: [1, 2] })
    expect(parsePartialJson('{"a": tru')).toEqual({})
  })

  it("returns undefined for garbage", () => {
    expect(parsePartialJson("")).toBeUndefined()
    expect(parsePartialJson("   ")).toBeUndefined()
  })
})
