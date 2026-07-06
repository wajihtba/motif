// Layout lint — post-apply geometric checks over the MEASURED scene
// (docs/plan/03-agent-first.md §7 "programmatic invariants"). Pure function:
// scene + a measure callback in, compact agent-facing findings out — same
// layering as describe.ts, so it runs headless in tests and identically for
// the agent loop and the editor overlay.
//
// Philosophy: warnings, never blocks. Intentional layering stays possible —
// text over images/scrims is never flagged (that's the whole point of a
// poster), and `allowOverlap` on a node (or any ancestor) opts a subtree out
// entirely. What IS flagged: content colliding with content — the "headline
// through the promo card" class of bug an LLM can't see without measurement.

import type { Box } from "../engine/backend"
import type { Scene, SceneNode } from "../scene/types"

export interface LintFinding {
  kind: "overlap" | "frame-overflow" | "container-overflow"
  ids: string[]
  /** One compact line, ready for the agent diff / UI chip. */
  message: string
}

export interface LintOptions {
  /** Min intersection depth on BOTH axes before an overlap counts (px). */
  minDepthPx?: number
  /** Min intersection area as a fraction of the smaller box. */
  minAreaFrac?: number
  /** Depth threshold for text-vs-text pairs (collision is never acceptable). */
  textDepthPx?: number
}

const DEFAULTS: Required<LintOptions> = {
  minDepthPx: 8,
  minAreaFrac: 0.04,
  textDepthPx: 4,
}

/** Roles that exist to be layered under/over content — never lint targets. */
const DECOR_ROLES = new Set(["image", "scrim", "vignette", "grain"])

const EDGE_TOLERANCE = 2 // px slack for frame/container overflow

export interface LintEntry {
  n: SceneNode
  parent: SceneNode | null
  /** Ancestor ids (root included) — for ancestor/descendant pair exclusion. */
  ancestorIds: Set<string>
  /** Nearest surfaced ancestor (a card the node visually lives in). */
  container: { n: SceneNode; box: Box } | null
  box: Box
  text: boolean
  surface: boolean
}

/** Every lint-relevant content box in the measured scene — the shared world
 *  model for lintLayout and the auto-fix placement search (autofix.ts). */
export function collectEntries(
  scene: Scene,
  measure: (id: string) => Box | null
): LintEntry[] {
  const entries: LintEntry[] = []
  const visit = (
    n: SceneNode,
    parent: SceneNode | null,
    ancestorIds: Set<string>,
    container: { n: SceneNode; box: Box } | null
  ) => {
    if (n.hidden) return
    // allowOverlap opts out the whole subtree — intentional layering.
    if (n.allowOverlap) return
    const box = measure(n.id)
    const usable =
      !!box && box.w > 0 && box.h > 0 && !isRotated(n) && !isInvisible(n)
    const isRoot = n.id === scene.root.id
    if (!isRoot && usable) {
      const text = isTextBearing(n)
      const surface = hasSurface(n) && !isDecor(n)
      if (text || surface) {
        entries.push({ n, parent, ancestorIds, container, box, text, surface })
      }
    }
    const nextAncestors = new Set(ancestorIds)
    nextAncestors.add(n.id)
    const nextContainer =
      !isRoot && usable && hasSurface(n) && !isDecor(n) ? { n, box } : container
    for (const c of n.children ?? []) {
      visit(c, n, nextAncestors, nextContainer)
    }
  }
  visit(scene.root, null, new Set(), null)
  return entries
}

/** Pairs that can never be a collision no matter their boxes: a node against
 *  its own ancestor/descendant, and flow siblings of one stack (the browser
 *  lays those out). */
export function pairExcluded(a: LintEntry, b: LintEntry): boolean {
  if (a.ancestorIds.has(b.n.id) || b.ancestorIds.has(a.n.id)) return true
  return !!(
    a.parent &&
    a.parent === b.parent &&
    a.parent.layout.mode === "stack" &&
    a.n.layout.mode === "flow" &&
    b.n.layout.mode === "flow"
  )
}

/** The overlap-severity rule on a pair of (possibly hypothetical) boxes —
 *  thresholds identical to what lintLayout flags, so auto-fix placements are
 *  validated against exactly the rule that would re-flag them. */
export function boxesCollide(
  a: { box: Box; text: boolean },
  b: { box: Box; text: boolean },
  o: Required<LintOptions> = DEFAULTS
): boolean {
  const ow = overlap1d(a.box.x, a.box.w, b.box.x, b.box.w)
  const oh = overlap1d(a.box.y, a.box.h, b.box.y, b.box.h)
  if (ow <= 0 || oh <= 0) return false
  const bothText = a.text && b.text
  const depth = bothText ? o.textDepthPx : o.minDepthPx
  if (ow < depth || oh < depth) return false
  if (!bothText) {
    const smaller = Math.min(a.box.w * a.box.h, b.box.w * b.box.h)
    if (ow * oh < o.minAreaFrac * smaller) return false
  }
  return true
}

export function lintLayout(
  scene: Scene,
  measure: (id: string) => Box | null,
  opts: LintOptions = {}
): LintFinding[] {
  const o = { ...DEFAULTS, ...opts }
  const entries = collectEntries(scene, measure)
  const findings: LintFinding[] = []

  // 1. content-on-content overlap ------------------------------------------
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (pairExcluded(a, b)) continue
      if (!boxesCollide(a, b, o)) continue
      const ow = overlap1d(a.box.x, a.box.w, b.box.x, b.box.w)
      const oh = overlap1d(a.box.y, a.box.h, b.box.y, b.box.h)
      findings.push({
        kind: "overlap",
        ids: [a.n.id, b.n.id],
        message: `${ref(a.n)} overlaps ${ref(b.n)} by ${r(ow)}×${r(oh)}px`,
      })
    }
  }

  // 2. text overflowing the canvas frame ------------------------------------
  for (const e of entries) {
    if (!e.text) continue
    const over = frameOverhang(e.box, scene.baseWidth, scene.baseHeight)
    if (over) {
      findings.push({
        kind: "frame-overflow",
        ids: [e.n.id],
        message: `${ref(e.n)} overflows the canvas by ${r(over.amount)}px at the ${over.side}`,
      })
    }
  }

  // 3. text spilling out of its own card -------------------------------------
  for (const e of entries) {
    if (!e.text || !e.container) continue
    if (e.ancestorIds.has(e.container.n.id)) {
      const c = e.container.box
      const spill = Math.max(
        c.x - e.box.x,
        c.y - e.box.y,
        e.box.x + e.box.w - (c.x + c.w),
        e.box.y + e.box.h - (c.y + c.h)
      )
      if (spill > EDGE_TOLERANCE) {
        findings.push({
          kind: "container-overflow",
          ids: [e.n.id, e.container.n.id],
          message: `${ref(e.n)} spills ${r(spill)}px outside ${ref(e.container.n)}`,
        })
      }
    }
  }

  return findings
}

/** Findings → capped `layout:` lines for the agent diff / tool chip. */
export function lintText(findings: LintFinding[], max = 6): string[] {
  if (!findings.length) return []
  const lines = findings.slice(0, max).map((f) => `layout: ${f.message}`)
  if (findings.length > max) {
    lines.push(`layout: …and ${findings.length - max} more`)
  }
  lines.push(
    "layout: fix these before finishing — restack or move elements; set allowOverlap:true only for intentional layering"
  )
  return lines
}

// --- classification -----------------------------------------------------------

function isTextBearing(n: SceneNode): boolean {
  if (n.children?.length) return false
  const text = (n.html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 0
}

/** An opaque-ish painted box (a card, a button, a filled badge). Photos are
 *  handled by isDecor — text over an image is always fine. */
function hasSurface(n: SceneNode): boolean {
  const bg = cssVal(n, "background") ?? cssVal(n, "backgroundColor")
  if (!bg) return false
  return !/^(transparent|none)$/i.test(bg.trim())
}

/** Backdrop material: decor roles and any photo node. Text layered over these
 *  is the normal case, never a collision. */
function isDecor(n: SceneNode): boolean {
  if (n.role && DECOR_ROLES.has(n.role)) return true
  return !!n.image
}

/** Rotated boxes make AABB intersection lie — skip rather than false-positive. */
function isRotated(n: SceneNode): boolean {
  const t = cssVal(n, "transform")
  return !!t && t.includes("rotate")
}

function isInvisible(n: SceneNode): boolean {
  return (
    cssVal(n, "opacity")?.trim() === "0" ||
    cssVal(n, "display")?.trim() === "none"
  )
}

/** css is Record<string,string> to the type system, but keys are sparse. */
function cssVal(n: SceneNode, key: string): string | undefined {
  const css: Partial<Record<string, string>> = n.css
  return css[key]
}

// --- geometry -------------------------------------------------------------------

function overlap1d(a: number, aw: number, b: number, bw: number): number {
  return Math.min(a + aw, b + bw) - Math.max(a, b)
}

function frameOverhang(
  box: Box,
  w: number,
  h: number
): { side: string; amount: number } | null {
  const sides = [
    { side: "left", amount: -box.x },
    { side: "top", amount: -box.y },
    { side: "right", amount: box.x + box.w - w },
    { side: "bottom", amount: box.y + box.h - h },
  ]
  const worst = sides.reduce((m, s) => (s.amount > m.amount ? s : m))
  return worst.amount > EDGE_TOLERANCE ? worst : null
}

function ref(n: SceneNode): string {
  return n.role ? `#${n.id} (${n.role})` : `#${n.id}`
}

const r = (n: number) => Math.round(n)
