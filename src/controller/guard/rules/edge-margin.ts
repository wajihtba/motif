// Edge-margin safety — text hugging the canvas edge closer than the
// format's safe inset (story UI chrome, feed cropping). Scoped hard to
// avoid fighting full-bleed design: only TEXT entries (cards/photos at the
// edge are usually deliberate), only when the box doesn't span the canvas
// on that axis, and only when the text isn't inside a card that itself
// hugs the edge (moving the child inside an edge-flush card is futile —
// that composition question rides to the model).

import type { DesignRule, GuardFinding, RuleContext } from "../types"
import { emitTranslations, isTranslatable } from "../../autofix"
import { collidesAt, movedBox, ref, round } from "./shared"

interface ClampData {
  id: string
  dx: number
  dy: number
}

export const edgeMarginRule: DesignRule = {
  id: "edge-margin",
  title: "Edge margin",
  description:
    "text closer to the canvas edge than the format's safe margin (platform chrome / crop zone)",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {
    /** 0 = use the format's safe inset (src/content/formats.ts). */
    marginPx: 0,
    /** A box spanning ≥ this fraction of the canvas on an axis is treated
     *  as intentional full-bleed on that axis. */
    fullBleedFrac: 0.9,
  },
  lint(ctx: RuleContext): GuardFinding[] {
    const margin =
      ctx.thresholds.marginPx > 0 ? ctx.thresholds.marginPx : ctx.formatSafe
    const { fullBleedFrac } = ctx.thresholds
    const W = ctx.scene.baseWidth
    const H = ctx.scene.baseHeight
    const findings: GuardFinding[] = []

    for (const e of ctx.entries) {
      if (!e.text || !isTranslatable(e.n)) continue
      const b = e.box
      // Outside the frame is frame-overflow's finding, not ours.
      if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) continue
      // Inside a card that itself hugs the edge → composition, not slop.
      if (e.container && e.ancestorIds.has(e.container.n.id)) {
        const c = e.container.box
        const cardHugs =
          c.x < margin ||
          c.y < margin ||
          W - (c.x + c.w) < margin ||
          H - (c.y + c.h) < margin
        if (cardHugs) continue
      }

      const spansX = b.w >= fullBleedFrac * W
      const spansY = b.h >= fullBleedFrac * H
      const sides: Array<{ side: string; dist: number; dx: number; dy: number }> = []
      if (!spansX) {
        if (b.x < margin) {
          sides.push({ side: "left", dist: b.x, dx: margin - b.x, dy: 0 })
        }
        const right = W - (b.x + b.w)
        if (right < margin) {
          sides.push({ side: "right", dist: right, dx: -(margin - right), dy: 0 })
        }
      }
      if (!spansY) {
        if (b.y < margin) {
          sides.push({ side: "top", dist: b.y, dx: 0, dy: margin - b.y })
        }
        const bottom = H - (b.y + b.h)
        if (bottom < margin) {
          sides.push({ side: "bottom", dist: bottom, dx: 0, dy: -(margin - bottom) })
        }
      }
      if (!sides.length) continue
      // A box pinched from both sides of one axis can't reach the margin on
      // either — that's a sizing question, ride to the model unfixed.
      const dx = sides.reduce((v, s) => v + s.dx, 0)
      const dy = sides.reduce((v, s) => v + s.dy, 0)
      const pinchedX = sides.some((s) => s.side === "left") && sides.some((s) => s.side === "right")
      const pinchedY = sides.some((s) => s.side === "top") && sides.some((s) => s.side === "bottom")
      const worst = sides.reduce((m, s) => (s.dist < m.dist ? s : m))
      findings.push({
        rule: "edge-margin",
        kind: "edge-margin",
        ids: [e.n.id],
        message: `${ref(e.n)} sits ${round(worst.dist)}px from the ${worst.side} edge (safe margin ${round(margin)}px)`,
        data:
          pinchedX || pinchedY
            ? undefined
            : ({ id: e.n.id, dx, dy } satisfies ClampData),
      })
    }
    return findings
  },
  autofix(findings, ctx) {
    const byId = new Map(ctx.entries.map((e) => [e.n.id, e]))
    const deltas = new Map<string, { dx: number; dy: number }>()
    for (const f of findings) {
      const data = f.data as ClampData | undefined
      if (!data) continue
      const e = byId.get(data.id)
      if (!e || deltas.has(data.id)) continue
      const box = movedBox(e.box, data.dx, data.dy)
      if (collidesAt(ctx, e, box)) continue
      deltas.set(data.id, { dx: data.dx, dy: data.dy })
    }
    return emitTranslations(ctx.scene, ctx.measure, deltas)
  },
}
