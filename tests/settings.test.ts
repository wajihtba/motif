// Guard-config persistence — round-trip, corrupt-JSON fallback, sparse
// defaulting, and per-rule merge semantics (persistence/settings.ts).

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_GUARD_CONFIG } from "@/controller/guard/types"
import {
  getGuardConfig,
  setGuardConfig,
  subscribeGuardConfig,
} from "@/persistence/settings"

const KEY = "motif:design-guard"

beforeEach(() => {
  localStorage.removeItem(KEY)
  // Reset the module memo by writing defaults through the public API.
  setGuardConfig({
    rules: {},
    agentAutofix: DEFAULT_GUARD_CONFIG.agentAutofix,
    visionJudge: { enabled: false, extraCriteria: undefined },
  })
  localStorage.removeItem(KEY)
})

describe("guard config", () => {
  it("round-trips a patch through localStorage", () => {
    setGuardConfig({ rules: { overlap: { enabled: false } } })
    expect(getGuardConfig().rules.overlap?.enabled).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).rules.overlap.enabled).toBe(
      false
    )
  })

  it("merges rule entries instead of replacing the map", () => {
    setGuardConfig({ rules: { overlap: { enabled: false } } })
    setGuardConfig({ rules: { alignment: { thresholds: { maxOffPx: 14 } } } })
    const cfg = getGuardConfig()
    expect(cfg.rules.overlap?.enabled).toBe(false)
    expect(cfg.rules.alignment?.thresholds?.maxOffPx).toBe(14)
  })

  it("merges within one rule entry (enabled kept when thresholds patch)", () => {
    setGuardConfig({ rules: { overlap: { enabled: false } } })
    setGuardConfig({ rules: { overlap: { thresholds: { minDepthPx: 12 } } } })
    const entry = getGuardConfig().rules.overlap
    expect(entry?.enabled).toBe(false)
    expect(entry?.thresholds?.minDepthPx).toBe(12)
  })

  it("notifies subscribers on set", () => {
    let called = 0
    const off = subscribeGuardConfig(() => called++)
    setGuardConfig({ agentAutofix: true })
    off()
    setGuardConfig({ agentAutofix: false })
    expect(called).toBe(1)
  })

  it("sparse config leaves unknown rules on registry defaults", () => {
    setGuardConfig({ rules: { overlap: { enabled: false } } })
    expect(getGuardConfig().rules["spacing-rhythm"]).toBeUndefined()
  })

  it("falls back to defaults on corrupt JSON (fresh module read)", async () => {
    vi.resetModules()
    localStorage.setItem(KEY, "{not json")
    const mod = await import("@/persistence/settings")
    expect(mod.getGuardConfig()).toEqual(DEFAULT_GUARD_CONFIG)
  })

  it("falls back to defaults on a version mismatch", async () => {
    vi.resetModules()
    localStorage.setItem(KEY, JSON.stringify({ version: 99, agentAutofix: true }))
    const mod = await import("@/persistence/settings")
    expect(mod.getGuardConfig()).toEqual(DEFAULT_GUARD_CONFIG)
  })
})
