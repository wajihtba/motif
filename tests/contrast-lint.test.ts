// Tier-1 contrast lint golden tests — pure scenes + Map-backed measure/probe/
// parse stubs (no DOM, no canvas). Pins exactly what is flagged, what passes,
// and what defers to the pixel sampler.

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { SceneNode } from "@/scene/types"
import type { Rgba } from "@/lib/css-color"
import type { ProbedStyle } from "@/controller/contrast-lint"
import {
  comparePaint,
  contrastFixPrompt,
  contrastText,
  lintContrast,
  resolveVars,
  verdictToFinding,
} from "@/controller/contrast-lint"
import { emptyScene, node } from "@/scene/model"

// --- stubs -------------------------------------------------------------------

/** Minimal deterministic parser: #rrggbb(aa), rgb()/rgba(), transparent. */
function parse(css: string): Rgba | null {
  const s = css.trim()
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
  const hexm = s.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/)
  if (hexm) {
    const v = Number.parseInt(hexm[1], 16)
    return {
      r: (v >> 16) & 255,
      g: (v >> 8) & 255,
      b: v & 255,
      a: hexm[2] ? Number.parseInt(hexm[2], 16) / 255 : 1,
    }
  }
  const fnm = s.match(/^rgba?\(([^)]+)\)$/)
  if (fnm) {
    const parts = fnm[1].split(",").map((p) => Number.parseFloat(p))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  return null
}

const STYLE_DEFAULTS: ProbedStyle = {
  color: "#000000",
  fontSizePx: 16,
  fontWeight: 400,
  opacity: 1,
  backgroundColor: "transparent",
  backgroundImage: "none",
  textShadow: "none",
  textStrokeWidthPx: 0,
  textStrokeColor: "transparent",
  backgroundClipText: false,
}

function prober(styles: Partial<Record<string, Partial<ProbedStyle>>>) {
  return (id: string): ProbedStyle | null => ({
    ...STYLE_DEFAULTS,
    ...(styles[id] ?? {}),
  })
}

function measurer(boxes: Record<string, Box>) {
  return (id: string): Box | null => boxes[id] ?? null
}

const FULL: Box = { x: 0, y: 0, w: 1080, h: 1080 }
const TEXT_BOX: Box = { x: 200, y: 400, w: 600, h: 120 }

function sceneWith(children: SceneNode[], background = "#ffffff") {
  const s = emptyScene()
  s.background = background
  s.root.children = children
  return s
}

const text = (id: string, extra: Partial<SceneNode> = {}) =>
  node({ id, role: "headline", html: "Slow Roast Sunday", ...extra })

// --- solid backdrops -----------------------------------------------------------

describe("solid backdrops (tier 1 decides)", () => {
  it("flags near-white text on a white background", () => {
    const s = sceneWith([text("h")])
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#f0f0f0" } }),
      parse
    )
    expect(deferred).toHaveLength(0)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("low-contrast")
    expect(findings[0].ids).toEqual(["h"])
    expect(findings[0].detail.ratio).toBeLessThan(1.5)
    expect(findings[0].detail.required).toBe(4.5)
    expect(findings[0].detail.suggest).toBe("adjust-lightness")
    expect(findings[0].message).toContain("#h")
    expect(findings[0].message).toContain("4.5:1")
  })

  it("passes black text on white", () => {
    const s = sceneWith([text("h")])
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#111111" } }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(0)
  })

  it("suggests a token swap when the color came from var()", () => {
    const s = sceneWith([text("h", { css: { color: "var(--primary)" } })])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#eeeeee" } }), // probe resolves the var
      parse
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].detail.textToken).toBe("--primary")
    expect(findings[0].detail.suggest).toBe("swap-token")
  })

  it("composites a semi-transparent card over the scene background", () => {
    // 80% black card over white → ~#333 → white text reads fine.
    const card = node({
      id: "card",
      role: "badge",
      css: { background: "rgba(0,0,0,0.8)" },
      children: [text("h")],
    })
    const s = sceneWith([card])
    const boxes = {
      root: FULL,
      card: { x: 100, y: 300, w: 800, h: 300 },
      h: TEXT_BOX,
    }
    const probeMap = {
      card: { backgroundColor: "rgba(0,0,0,0.8)" },
      h: { color: "#ffffff" },
    }
    const ok = lintContrast(s, measurer(boxes), prober(probeMap), parse)
    expect(ok.findings).toHaveLength(0)
    expect(ok.deferred).toHaveLength(0)

    // A near-white 90% card over white → white text unreadable.
    const bad = lintContrast(
      s,
      measurer(boxes),
      prober({
        card: { backgroundColor: "rgba(250,250,250,0.9)" },
        h: { color: "#ffffff" },
      }),
      parse
    )
    expect(bad.findings).toHaveLength(1)
    expect(bad.findings[0].detail.ratio).toBeLessThan(1.5)
  })

  it("uses the text's own background plate as the nearest backdrop", () => {
    const s = sceneWith([text("cta", { role: "cta" })])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, cta: TEXT_BOX }),
      prober({
        cta: { color: "#ffffff", backgroundColor: "#1a1a2e" },
      }),
      parse
    )
    expect(findings).toHaveLength(0)
  })

  it("relaxes the threshold to 3:1 for large text", () => {
    // ~3.2:1 gray: fails at 16px, passes at 32px.
    const s = sceneWith([text("big"), text("small")])
    const { findings } = lintContrast(
      s,
      measurer({
        root: FULL,
        big: TEXT_BOX,
        small: { x: 200, y: 600, w: 600, h: 40 },
      }),
      prober({
        big: { color: "#8f8f8f", fontSizePx: 32 },
        small: { color: "#8f8f8f", fontSizePx: 16 },
      }),
      parse
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].ids).toEqual(["small"])
    expect(findings[0].detail.required).toBe(4.5)
  })

  it("accounts for inherited opacity when compositing the text color", () => {
    // 35% white text on near-black: effective glyph is dark-gray on black.
    const wrap = node({
      id: "wrap",
      css: { opacity: "0.35" },
      children: [text("h")],
    })
    const s = sceneWith([wrap], "#101010")
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, wrap: TEXT_BOX, h: TEXT_BOX }),
      prober({ wrap: { opacity: 0.35 }, h: { color: "#ffffff" } }),
      parse
    )
    expect(findings).toHaveLength(1)
  })
})

// --- deferrals ------------------------------------------------------------------

describe("complex backdrops (defer to the pixel sampler)", () => {
  it("defers text over a photo node", () => {
    const s = sceneWith([
      node({ id: "photo", role: "image", image: "asset:hero" }),
      text("h"),
    ])
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, photo: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#ffffff" } }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    expect(deferred[0].id).toBe("h")
    expect(deferred[0].reason).toBe("image")
    expect(deferred[0].box).toEqual(TEXT_BOX)
    expect(deferred[0].required).toBe(4.5)
  })

  it("defers text over a gradient surface", () => {
    const s = sceneWith([
      node({ id: "grad", css: { background: "linear-gradient(#000,#fff)" } }),
      text("h"),
    ])
    const { deferred } = lintContrast(
      s,
      measurer({ root: FULL, grad: FULL, h: TEXT_BOX }),
      prober({
        grad: {
          backgroundImage: "linear-gradient(rgb(0,0,0), rgb(255,255,255))",
        },
        h: { color: "#ffffff" },
      }),
      parse
    )
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("gradient")
  })

  it("defers when a solid card only partially covers the text", () => {
    const s = sceneWith([
      node({ id: "half", css: { background: "#000000" } }),
      text("h"),
    ])
    const { deferred } = lintContrast(
      s,
      measurer({
        root: FULL,
        half: { x: 0, y: 0, w: 500, h: 1080 }, // covers only the left of the text
        h: TEXT_BOX,
      }),
      prober({ half: { backgroundColor: "#000000" }, h: { color: "#ffffff" } }),
      parse
    )
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("partial")
  })

  it("canvas-scope effect: unprotected text defers as styled ink (pixel diff)", () => {
    const s = sceneWith([text("h")])
    s.effects = [
      {
        id: "fx1",
        effect: "dither",
        kind: "pixel",
        params: {},
        animate: false,
        enabled: true,
        target: { type: "canvas" },
        scope: "content",
      },
    ]
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#ffffff" } }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("styled-ink")
    expect(deferred[0].pixelInk).toBe(true)
  })

  it("canvas-scope effect: text excluded from it keeps css ink (plain defer)", () => {
    const s = sceneWith([text("h")])
    s.effects = [
      {
        id: "fx1",
        effect: "dither",
        kind: "pixel",
        params: {},
        animate: false,
        enabled: true,
        target: { type: "canvas" },
        scope: "content",
        exclude: { ids: ["h"] }, // composites crisp above the effect
      },
    ]
    const { deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#ffffff" } }),
      parse
    )
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("effect")
    expect(deferred[0].pixelInk).toBe(false)
  })

  it("a disabled effect does not defer", () => {
    const s = sceneWith([text("h")])
    s.effects = [
      {
        id: "fx1",
        effect: "dither",
        kind: "pixel",
        params: {},
        animate: false,
        enabled: false,
        target: { type: "canvas" },
        scope: "content",
      },
    ]
    const { deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#111111" } }),
      parse
    )
    expect(deferred).toHaveLength(0)
  })

  it("element-effect text defers as styled ink — never silently skipped (the vaporwave-look bug)", () => {
    // Looks put a filter on EVERY text node ("*text"); skipping those nodes
    // once made every look-styled gallery scene invisible to the checker.
    const s = sceneWith([text("h")])
    s.effects = [
      {
        id: "fx1",
        effect: "vaporwave",
        kind: "filter",
        params: {},
        animate: false,
        enabled: true,
        target: { type: "elements", ids: ["h"] },
        scope: "text",
      },
    ]
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({ h: { color: "#ffffff" } }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("styled-ink")
    expect(deferred[0].pixelInk).toBe(true)
  })

  it("styled-ink defers even when a shadow would rescue plain text", () => {
    // Filters transform the shadow too — the rescue rule can't be trusted.
    const s = sceneWith([text("h")])
    s.effects = [
      {
        id: "fx1",
        effect: "vaporwave",
        kind: "filter",
        params: {},
        animate: false,
        enabled: true,
        target: { type: "elements", ids: ["h"] },
        scope: "text",
      },
    ]
    const { deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          color: "#ffffff",
          textShadow: "rgba(0, 0, 0, 0.8) 0px 1px 3px",
        },
      }),
      parse
    )
    expect(deferred).toHaveLength(1)
    expect(deferred[0].reason).toBe("styled-ink")
  })

  it("opaque solid card above a photo decides in tier 1 (photo never reached)", () => {
    const s = sceneWith([
      node({ id: "photo", role: "image", image: "asset:hero" }),
      node({ id: "plate", css: { background: "#0b0b0b" } }),
      text("h"),
    ])
    const { findings, deferred } = lintContrast(
      s,
      measurer({
        root: FULL,
        photo: FULL,
        plate: { x: 150, y: 350, w: 700, h: 220 },
        h: TEXT_BOX,
      }),
      prober({
        plate: { backgroundColor: "#0b0b0b" },
        h: { color: "#ffffff" },
      }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(0)
  })
})

// --- rescues & opt-outs ------------------------------------------------------------

describe("rescues and opt-outs", () => {
  it("a tight contrasting halo rescues low fill contrast", () => {
    const s = sceneWith([text("h")])
    const { findings, deferred } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          color: "#ffffff",
          textShadow: "rgba(0, 0, 0, 0.8) 0px 1px 3px",
        },
      }),
      parse
    )
    expect(findings).toHaveLength(0)
    expect(deferred).toHaveLength(0)
  })

  it("a soft offset drop-shadow does NOT rescue", () => {
    const s = sceneWith([text("h")])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          color: "#ffffff",
          textShadow: "rgba(0, 0, 0, 0.4) 0px 8px 24px",
        },
      }),
      parse
    )
    expect(findings).toHaveLength(1)
  })

  it("a ≥1px contrasting text-stroke rescues", () => {
    const s = sceneWith([text("h")])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          color: "#ffffff",
          textStrokeWidthPx: 1.5,
          textStrokeColor: "rgba(0, 0, 0, 1)",
        },
      }),
      parse
    )
    expect(findings).toHaveLength(0)
  })

  it("allowLowContrast opts out the node and its subtree", () => {
    const onNode = sceneWith([text("h", { allowLowContrast: true })])
    expect(
      lintContrast(
        onNode,
        measurer({ root: FULL, h: TEXT_BOX }),
        prober({ h: { color: "#ffffff" } }),
        parse
      ).findings
    ).toHaveLength(0)

    const onAncestor = sceneWith([
      node({ id: "wrap", allowLowContrast: true, children: [text("h")] }),
    ])
    expect(
      lintContrast(
        onAncestor,
        measurer({ root: FULL, wrap: FULL, h: TEXT_BOX }),
        prober({ h: { color: "#ffffff" } }),
        parse
      ).findings
    ).toHaveLength(0)
  })

  it("skips hidden and rotated text", () => {
    const hidden = sceneWith([text("h", { hidden: true })])
    expect(
      lintContrast(
        hidden,
        measurer({ root: FULL, h: TEXT_BOX }),
        prober({ h: { color: "#ffffff" } }),
        parse
      ).findings
    ).toHaveLength(0)

    const rotated = sceneWith([
      text("h", { css: { transform: "rotate(12deg)" } }),
    ])
    expect(
      lintContrast(
        rotated,
        measurer({ root: FULL, h: TEXT_BOX }),
        prober({ h: { color: "#ffffff" } }),
        parse
      ).findings
    ).toHaveLength(0)
  })
})

// --- gradient-filled text -----------------------------------------------------------

describe("gradient-filled (clip) text", () => {
  it("checks every gradient stop against the backdrop", () => {
    const s = sceneWith([
      text("h", {
        css: {
          backgroundImage: "linear-gradient(180deg, #ffffff, #ebebeb)",
          backgroundClip: "text",
        },
      }),
    ])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          backgroundClipText: true,
          backgroundImage:
            "linear-gradient(180deg, rgb(255,255,255), rgb(235,235,235))",
        },
      }),
      parse
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].detail.textColor).toBe("gradient")
  })

  it("passes when all stops contrast", () => {
    const s = sceneWith([
      text("h", {
        css: {
          backgroundImage: "linear-gradient(180deg, #111111, #333333)",
          backgroundClip: "text",
        },
      }),
    ])
    const { findings } = lintContrast(
      s,
      measurer({ root: FULL, h: TEXT_BOX }),
      prober({
        h: {
          backgroundClipText: true,
          backgroundImage:
            "linear-gradient(180deg, rgb(17,17,17), rgb(51,51,51))",
        },
      }),
      parse
    )
    expect(findings).toHaveLength(0)
  })
})

// --- helpers ---------------------------------------------------------------------

describe("helpers", () => {
  it("resolveVars resolves tokens, fallbacks, and nesting", () => {
    const tokens = {
      "--primary": "#123456",
      "--accent": "var(--primary)",
    }
    expect(resolveVars("var(--primary)", tokens)).toBe("#123456")
    expect(resolveVars("var(--accent)", tokens)).toBe("#123456")
    expect(resolveVars("var(--missing, #fff)", tokens)).toBe("#fff")
    expect(resolveVars("1px solid var(--primary)", tokens)).toBe(
      "1px solid #123456"
    )
  })

  it("comparePaint: ancestors first, siblings in order, z-index wins", () => {
    expect(comparePaint([0, 0], [0, 0, 0, 1])).toBeLessThan(0) // ancestor below child
    expect(comparePaint([0, 0, 0, 0], [0, 0, 0, 1])).toBeLessThan(0) // sibling order
    expect(comparePaint([0, 0, 5, 0], [0, 0, 0, 1])).toBeGreaterThan(0) // z-index
  })

  it("contrastText caps lines and appends the fix vocabulary", () => {
    const finding = {
      kind: "low-contrast" as const,
      ids: ["h"],
      message: "#h — 1.2:1 #ffffff text on #f0f0f0; needs 4.5:1",
      detail: {
        ratio: 1.2,
        required: 4.5,
        textColor: "#ffffff",
        backdrop: {
          kind: "solid" as const,
          color: { r: 240, g: 240, b: 240, a: 1 },
        },
        suggest: "adjust-lightness" as const,
      },
    }
    const lines = contrastText([finding, finding, finding], 2)
    expect(lines[0]).toMatch(/^contrast: #h/)
    expect(lines[2]).toContain("…and 1 more")
    expect(lines[3]).toContain("allowLowContrast")
    expect(contrastText([])).toHaveLength(0)
  })

  it("verdictToFinding: pass → null, fail → finding with worst ratio", () => {
    const check = {
      id: "h",
      box: TEXT_BOX,
      textColors: [{ r: 255, g: 255, b: 255, a: 1 }],
      required: 4.5,
      reason: "image" as const,
      ref: "#h (headline)",
      textColorCss: "#ffffff",
    }
    expect(
      verdictToFinding(check, {
        pass: true,
        worstRatio: 12,
        failFrac: 0,
        medianBackdrop: { r: 10, g: 10, b: 10, a: 1 },
      })
    ).toBeNull()
    const f = verdictToFinding(check, {
      pass: false,
      worstRatio: 1.8,
      failFrac: 0.4,
      medianBackdrop: { r: 230, g: 230, b: 230, a: 1 },
    })!
    expect(f.kind).toBe("low-contrast")
    expect(f.message).toContain("1.8:1")
    expect(f.message).toContain("light")
    expect(f.detail.suggest).toBe("scrim")
  })
})

describe("contrastFixPrompt", () => {
  it("builds a specific, per-issue chat prompt for the Fix-with-AI button", () => {
    const prompt = contrastFixPrompt([
      {
        kind: "low-contrast",
        ids: ["h"],
        message: "#h (headline) — 1.2:1 #ffffff text on #f0f0f0; needs 4.5:1",
        detail: {
          ratio: 1.2,
          required: 4.5,
          textColor: "#ffffff",
          textToken: "--muted",
          backdrop: { kind: "solid", color: { r: 240, g: 240, b: 240, a: 1 } },
          suggest: "swap-token",
        },
      },
    ])
    expect(prompt).toContain("readability")
    expect(prompt).toContain("#h (headline)")
    expect(prompt).toContain("var(--ink)")
    expect(prompt).toContain("--muted")
    expect(prompt).toContain("AllowLowContrast")
  })
})
