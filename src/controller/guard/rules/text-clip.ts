// Text clipping — words the render silently cuts off. Two tiers:
//
//   1. clipped-by-ancestor (pure geometry, runs headless): the text box
//      extends past an ancestor that has overflow hidden/clip. Beyond
//      container-overflow's scope — that rule only judges the nearest
//      SURFACED container and ignores clipping semantics entirely.
//   2. clipped-by-self (live backend only): a fixed-height text leaf whose
//      scrollHeight exceeds its clientHeight — the box is simply too short
//      for its own words. Needs probeScroll; degrades silently headless.
//
// Fix: only the self-clip has a safe deterministic move — release the fixed
// height to "auto" and let the next pass re-judge the reflow. Ancestor clips
// are a design decision (mask? crop? rewrite?) and always ride to the model.

import type { DesignRule, GuardFinding, RuleContext } from "../types"
import type { CommandCall } from "../../dispatch"
import type { SceneNode } from "../../../scene/types"
import { flatten } from "../../../scene/model"
import { isTranslatable } from "../../autofix"
import { ref, round } from "./shared"

interface SelfClipData {
  id: string
  kind: "self"
}

const CLIP_VALUES = new Set(["hidden", "clip"])

function clipsOverflow(n: SceneNode): boolean {
  const css: Partial<Record<string, string>> = n.css
  return [css.overflow, css.overflowX, css.overflowY, css["overflow-x"], css["overflow-y"]].some(
    (v) => !!v && CLIP_VALUES.has(v.trim())
  )
}

/** A leaf whose height is pinned — by normalized layout or raw css. */
function fixedHeight(n: SceneNode): { byLayout: boolean; byCss: boolean } {
  const css: Partial<Record<string, string>> = n.css
  const byCss = !!css.height || !!css.maxHeight || !!css["max-height"]
  const layout = n.layout
  const byLayout =
    (layout.mode === "absolute" || layout.mode === "stack") &&
    layout.height != null &&
    layout.height !== "auto"
  return { byLayout, byCss }
}

export const textClipRule: DesignRule = {
  id: "text-clip",
  title: "Text clipping",
  description:
    "text visually cut off — by an overflow-hidden ancestor or its own fixed height",
  tier: "sync",
  defaultEnabled: true,
  defaultThresholds: {
    /** Overhang below this is line-box slack, not lost words. */
    minClipPx: 4,
  },
  lint(ctx: RuleContext): GuardFinding[] {
    const { minClipPx } = ctx.thresholds
    const findings: GuardFinding[] = []
    const byId = new Map<string, SceneNode>(
      [ctx.scene.root, ...flatten(ctx.scene.root)].map((n) => [n.id, n])
    )

    for (const e of ctx.entries) {
      if (!e.text) continue

      // Tier 1 — an overflow-clipping ancestor the box escapes.
      for (const aid of e.ancestorIds) {
        if (aid === ctx.scene.root.id) continue // frame-overflow owns the frame
        if (aid === e.container?.n.id) continue // container-overflow owns it
        const a = byId.get(aid)
        if (!a || !clipsOverflow(a)) continue
        const ab = ctx.measure(aid)
        if (!ab || ab.w <= 0 || ab.h <= 0) continue
        const over = Math.max(
          ab.x - e.box.x,
          ab.y - e.box.y,
          e.box.x + e.box.w - (ab.x + ab.w),
          e.box.y + e.box.h - (ab.y + ab.h)
        )
        if (over > minClipPx) {
          findings.push({
            rule: "text-clip",
            kind: "text-clip",
            ids: [e.n.id, aid],
            message: `${ref(e.n)} is clipped ${round(over)}px by ${ref(a)} (overflow hidden)`,
          })
          break // one ancestor finding per node is enough signal
        }
      }

      // Tier 2 — the node's own fixed height hides lines.
      if (!ctx.probeScroll) continue
      const { byLayout, byCss } = fixedHeight(e.n)
      if (!byLayout && !byCss) continue
      const s = ctx.probeScroll(e.n.id)
      if (!s || s.clientH <= 0) continue
      if (s.scrollH > s.clientH + minClipPx) {
        findings.push({
          rule: "text-clip",
          kind: "text-clip",
          ids: [e.n.id],
          message: `${ref(e.n)} needs ${round(s.scrollH)}px for its text but its fixed height shows ${round(s.clientH)}px`,
          // css-pinned heights are a styling decision — no automatic release.
          data:
            byLayout && !byCss
              ? ({ id: e.n.id, kind: "self" } satisfies SelfClipData)
              : undefined,
        })
      }
    }
    return findings
  },
  autofix(findings, ctx) {
    const byId = new Map(ctx.entries.map((e) => [e.n.id, e]))
    const calls: CommandCall[] = []
    for (const f of findings) {
      const data = f.data as SelfClipData | undefined
      if (!data) continue
      const e = byId.get(data.id)
      if (!e || !isTranslatable(e.n)) continue
      const layout = e.n.layout
      if (layout.mode === "flow") continue
      calls.push({
        command: "element.setLayout",
        args: { id: data.id, layout: { ...layout, height: "auto" } },
      })
    }
    return calls
  },
}
