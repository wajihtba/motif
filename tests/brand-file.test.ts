// Brand file round-trip (logo-less paths — the IndexedDB asset leg is
// exercised in the browser verify; jsdom has no indexedDB).

import { describe, expect, it } from "vitest"
import type { Brand } from "@/brand/types"
import { exportBrandFile, importBrandFile } from "@/brand/brand-file"
import { parseCssText, cssTextFromRecord } from "@/brand/css-text"
import { DEFAULT_THEME } from "@/scene/theme"

function sampleBrand(): Brand {
  return {
    id: "b_test",
    name: "Acme",
    version: 1,
    theme: {
      mode: "dark",
      tokens: { ...DEFAULT_THEME.tokens, "--primary": "oklch(0.7 0.2 30)" },
    },
    voice: "Confident, warm.",
    components: {
      cta: { variants: { shape: "pill" }, css: { textTransform: "uppercase" } },
      "card-product": { hidden: true },
    },
    motion: { entrance: "popIn", pace: "snappy", ambient: "none", stagger: 0.2 },
    createdAt: 1,
    updatedAt: 2,
  }
}

describe("brand file", () => {
  it("round-trips theme, components, voice, and motion", async () => {
    const file = await exportBrandFile(sampleBrand())
    expect(file.version).toBe(1)
    expect(file.$schema).toContain("brand.schema")

    const imported = await importBrandFile(JSON.parse(JSON.stringify(file)))
    expect(imported.name).toBe("Acme")
    expect(imported.id).not.toBe("b_test") // fresh id on import
    expect(imported.theme.tokens["--primary"]).toBe("oklch(0.7 0.2 30)")
    expect(imported.voice).toBe("Confident, warm.")
    expect(imported.components.cta.variants?.shape).toBe("pill")
    expect(imported.components["card-product"].hidden).toBe(true)
    expect(imported.motion).toMatchObject({
      entrance: "popIn",
      pace: "snappy",
      ambient: "none",
      stagger: 0.2,
    })
  })

  it("fills missing token keys from defaults on import (older files)", async () => {
    const file = await exportBrandFile(sampleBrand())
    delete file.theme.tokens["--shadow"]
    const imported = await importBrandFile(file)
    expect(imported.theme.tokens["--shadow"]).toBe(
      DEFAULT_THEME.tokens["--shadow"]
    )
  })

  it("rejects malformed files with readable errors", async () => {
    await expect(importBrandFile(null)).rejects.toThrow("JSON object")
    await expect(importBrandFile({ version: 2 })).rejects.toThrow("version")
    await expect(importBrandFile({ version: 1, name: "x" })).rejects.toThrow(
      "theme tokens"
    )
  })
})

describe("css text helpers", () => {
  it("parses kebab-case declarations to a camelCase record and back", () => {
    const rec = parseCssText("text-transform: uppercase;\nborder-radius: 4px")
    expect(rec).toEqual({ textTransform: "uppercase", borderRadius: "4px" })
    expect(cssTextFromRecord(rec)).toBe(
      "text-transform: uppercase;\nborder-radius: 4px;"
    )
  })

  it("keeps var() and calc() values intact", () => {
    const rec = parseCssText("padding: calc(var(--space) * 2) 12px")
    expect(rec.padding).toBe("calc(var(--space) * 2) 12px")
  })
})
