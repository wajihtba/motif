// Layout lint golden tests — pure scenes + a Map-backed measure fn. The lint
// is the agent's post-apply feedback (and the editor's badge source), so these
// pin exactly what is and is NOT a violation.

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { SceneNode } from "@/scene/types"
import { lintLayout, lintText } from "@/controller/lint"
import { emptyScene, node } from "@/scene/model"

function sceneWith(children: SceneNode[]) {
  const s = emptyScene() // 1080×1080
  s.root.children = children
  return s
}

function measurer(boxes: Record<string, Box>) {
  return (id: string): Box | null => boxes[id] ?? null
}

const text = (id: string, extra: Partial<SceneNode> = {}) =>
  node({ id, role: "headline", html: "Slow Roast Sunday", ...extra })

const card = (id: string, extra: Partial<SceneNode> = {}) =>
  node({
    id,
    role: "badge",
    css: { background: "rgba(30,20,10,0.9)" },
    ...extra,
  })

describe("overlap", () => {
  it("flags two colliding text leaves", () => {
    const s = sceneWith([text("a"), text("b")])
    const findings = lintLayout(
      s,
      measurer({
        a: { x: 100, y: 100, w: 400, h: 120 },
        b: { x: 120, y: 180, w: 400, h: 60 },
      })
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("overlap")
    expect(findings[0].ids).toEqual(["a", "b"])
    expect(findings[0].message).toContain("#a")
    expect(findings[0].message).toContain("overlaps")
  })

  it("ignores sub-threshold text grazing (descenders)", () => {
    const s = sceneWith([text("a"), text("b")])
    const findings = lintLayout(
      s,
      measurer({
        a: { x: 100, y: 100, w: 400, h: 100 },
        b: { x: 100, y: 197, w: 400, h: 100 }, // 3px vertical graze
      })
    )
    expect(findings).toHaveLength(0)
  })

  it("flags text colliding with a surfaced card (the screenshot bug)", () => {
    const s = sceneWith([text("headline"), card("promo")])
    const findings = lintLayout(
      s,
      measurer({
        headline: { x: 200, y: 380, w: 600, h: 220 },
        promo: { x: 300, y: 500, w: 450, h: 240 },
      })
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].ids).toEqual(["headline", "promo"])
  })

  it("never flags text over images, scrims, or photo nodes", () => {
    const s = sceneWith([
      text("headline"),
      node({ id: "photo", role: "image", css: { background: "#000" } }),
      node({ id: "scrim", role: "scrim", css: { background: "#0008" } }),
      node({ id: "untagged-photo", image: "asset:hero" }),
    ])
    const everywhere: Box = { x: 0, y: 0, w: 1080, h: 1080 }
    const findings = lintLayout(
      s,
      measurer({
        headline: { x: 200, y: 400, w: 600, h: 200 },
        photo: everywhere,
        scrim: everywhere,
        "untagged-photo": everywhere,
      })
    )
    expect(findings).toHaveLength(0)
  })

  it("allowOverlap on either node (or an ancestor) suppresses the pair", () => {
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 150, w: 400, h: 120 },
      wrap: { x: 100, y: 130, w: 500, h: 200 },
    }
    const onNode = sceneWith([text("a", { allowOverlap: true }), text("b")])
    expect(lintLayout(onNode, measurer(boxes))).toHaveLength(0)

    const onAncestor = sceneWith([
      text("a"),
      node({ id: "wrap", allowOverlap: true, children: [text("b")] }),
    ])
    expect(lintLayout(onAncestor, measurer(boxes))).toHaveLength(0)
  })

  it("skips hidden and rotated nodes", () => {
    const boxes = {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 150, w: 400, h: 120 },
    }
    const hidden = sceneWith([text("a", { hidden: true }), text("b")])
    expect(lintLayout(hidden, measurer(boxes))).toHaveLength(0)

    const rotated = sceneWith([
      text("a", { css: { transform: "rotate(12deg)" } }),
      text("b"),
    ])
    expect(lintLayout(rotated, measurer(boxes))).toHaveLength(0)
  })

  it("flow siblings of one stack never collide", () => {
    const stack = node({
      id: "col",
      role: "group",
      layout: {
        mode: "stack",
        direction: "column",
        gap: 0,
        align: "center",
        justify: "start",
      },
      children: [
        text("a", { layout: { mode: "flow" } }),
        text("b", { layout: { mode: "flow" } }),
      ],
    })
    const findings = lintLayout(
      sceneWith([stack]),
      measurer({
        col: { x: 100, y: 100, w: 500, h: 300 },
        // adjacent boxes that would trip the text threshold if absolute
        a: { x: 100, y: 100, w: 400, h: 120 },
        b: { x: 100, y: 150, w: 400, h: 120 },
      })
    )
    expect(findings).toHaveLength(0)
  })
})

describe("overflow", () => {
  it("flags text past the canvas edge; decor bleed is fine", () => {
    const s = sceneWith([
      text("sub"),
      node({ id: "glow", role: "vignette", css: { background: "#fff2" } }),
    ])
    const findings = lintLayout(
      s,
      measurer({
        sub: { x: 200, y: 1000, w: 400, h: 116 }, // 36px past the bottom
        glow: { x: -200, y: -200, w: 1480, h: 1480 },
      })
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("frame-overflow")
    expect(findings[0].message).toContain("36px at the bottom")
  })

  it("flags text spilling out of its own card", () => {
    const s = sceneWith([
      card("promo", { role: "group", children: [text("offer")] }),
    ])
    const findings = lintLayout(
      s,
      measurer({
        promo: { x: 300, y: 500, w: 450, h: 240 },
        offer: { x: 320, y: 520, w: 500, h: 100 }, // 70px past the right edge
      })
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("container-overflow")
    expect(findings[0].ids).toEqual(["offer", "promo"])
  })

  it("text comfortably inside its card is clean", () => {
    const s = sceneWith([
      card("promo", { role: "group", children: [text("offer")] }),
    ])
    const findings = lintLayout(
      s,
      measurer({
        promo: { x: 300, y: 500, w: 450, h: 240 },
        offer: { x: 320, y: 520, w: 400, h: 100 },
      })
    )
    expect(findings).toHaveLength(0)
  })
})

describe("lintText", () => {
  it("prefixes, caps, and appends the fix contract", () => {
    const findings = Array.from({ length: 8 }, (_, i) => ({
      kind: "overlap" as const,
      ids: [`a${i}`, `b${i}`],
      message: `#a${i} overlaps #b${i} by 10×10px`,
    }))
    const lines = lintText(findings, 6)
    expect(lines).toHaveLength(8) // 6 findings + "…and 2 more" + contract
    expect(lines[0]).toBe("layout: #a0 overlaps #b0 by 10×10px")
    expect(lines[6]).toContain("and 2 more")
    expect(lines[7]).toContain("allowOverlap")
  })

  it("is silent when there is nothing to say", () => {
    expect(lintText([])).toHaveLength(0)
  })
})
