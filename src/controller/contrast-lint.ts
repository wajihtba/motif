// Contrast lint — deterministic text-readability checks over the MEASURED
// scene, same layering contract as lint.ts: scene + injectable callbacks in,
// compact findings out, headless-testable with Map-backed stubs.
//
// Tier 1 (this module, sync): resolve the text's effective color and composite
// the stack of SOLID underlays beneath its box; flag when the WCAG ratio falls
// short. Anything tier 1 cannot decide exactly — photos, gradients, partial
// covers, canvas effects — is handed off as a DeferredCheck for the pixel
// sampler (src/engine/export/sample-contrast.ts) instead of guessed at.
// Philosophy matches lint.ts: warnings, never blocks, and never a false
// positive tier 1 can avoid.

import type { Box, ProbedStyle } from "../engine/backend"
import type { Scene, SceneNode } from "../scene/types"
import type { Rgba } from "../lib/css-color"
import type { SampleVerdict } from "../lib/contrast"
import {
  compositeOver,
  contrastRatio,
  relativeLuminance,
  requiredRatio,
} from "../lib/contrast"
import { protectedIds } from "../engine/effect-plan"
import { isTextBearing } from "./lint"

// --- public types -----------------------------------------------------------

/** Computed style of a node read off the measurement host (getComputedStyle —
 *  resolves inheritance, var(--token) and scene.stylesheet). Injectable so
 *  tests run without a DOM. */
export type { ProbedStyle }

export type StyleProbe = (id: string) => ProbedStyle | null

export type ColorParser = (css: string) => Rgba | null

export type BackdropReason =
  | "image"
  | "gradient"
  | "effect"
  | "partial"
  | "clip-text"
  /** The text's own rendered ink is effect/filter-styled — css color math is
   *  meaningless; only the ink-diff pixel sampler can judge it. */
  | "styled-ink"

export type Backdrop =
  | { kind: "solid"; color: Rgba }
  /** `median` is the sampled representative color (tier-2 verdicts only). */
  | { kind: "complex"; reason: BackdropReason; median?: Rgba }

export type ContrastSuggest =
  "swap-token" | "adjust-lightness" | "scrim" | "text-shadow"

export interface ContrastFinding {
  kind: "low-contrast"
  ids: string[]
  /** One compact line, ready for the agent diff / UI chip. */
  message: string
  detail: {
    /** Measured ratio (tier 1 exact; tier 2 worst block median). */
    ratio: number
    required: number
    /** Effective text color as css rgba/hex. */
    textColor: string
    /** Measured RENDERED ink color (ink-diff verdicts) — what the glyphs
     *  actually paint after effects/filters; prefer over textColor. */
    inkColor?: string
    /** Token name when the color came via var(--x). */
    textToken?: string
    backdrop: Backdrop
    suggest: ContrastSuggest
  }
}

/** A text node tier 1 could not decide — the pixel sampler settles it. */
export interface DeferredCheck {
  id: string
  box: Box
  /** Effective text color(s) — several for gradient-filled type. */
  textColors: Rgba[]
  required: number
  reason: BackdropReason
  /** Judge by ink-diff (render with vs without the text) instead of css
   *  color — set when effects/filters style the rendered glyphs. */
  pixelInk?: boolean
  /** Carried through so verdictToFinding can build the finding. */
  ref: string
  textColorCss: string
  textToken?: string
}

export interface ContrastOptions {
  /** Override the WCAG threshold for every node (tests / strict mode). */
  requiredOverride?: number
}

/** Slack below the threshold before flagging — keeps boundary designs from
 *  flickering in and out of the findings list on rounding. */
const RATIO_SLACK = 0.05

// --- var() resolution --------------------------------------------------------

/** Resolve var(--x[, fallback]) references through the theme token map
 *  (handles nesting and token→token indirection, depth-capped). Pure —
 *  used where getComputedStyle isn't available (raw scene strings). */
export function resolveVars(
  value: string,
  tokens: Record<string, string>,
  depth = 8
): string {
  if (depth <= 0 || !value.includes("var(")) return value
  const out = value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (_, name: string, fallback?: string) =>
      tokens[name] ?? (fallback ?? "").trim()
  )
  return out === value ? out : resolveVars(out, tokens, depth - 1)
}

// --- paint order --------------------------------------------------------------

/** Per-depth (zIndex, siblingIndex) pairs from root to node. Lexicographic
 *  comparison of these keys mirrors DOM paint order for the positioned boxes
 *  the compositor snapshots: an ancestor (prefix) paints below its subtree,
 *  later siblings paint above earlier ones, higher z-index wins its level. */
export type PaintKey = number[]

export function comparePaint(a: PaintKey, b: PaintKey): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length // prefix (ancestor) paints first
}

// --- geometry ----------------------------------------------------------------

const EDGE_TOLERANCE = 2 // px slack for the contains test

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

function contains(outer: Box, inner: Box, tol = EDGE_TOLERANCE): boolean {
  return (
    outer.x <= inner.x + tol &&
    outer.y <= inner.y + tol &&
    outer.x + outer.w >= inner.x + inner.w - tol &&
    outer.y + outer.h >= inner.y + inner.h - tol
  )
}

// --- world model ---------------------------------------------------------------

interface Entry {
  n: SceneNode
  box: Box
  key: PaintKey
  /** Product of css/computed opacity from root down to this node. */
  opacityChain: number
  ancestorIds: Set<string>
  /** Raw css color declaration that applies (own or inherited). */
  colorDecl?: string
}

function cssVal(n: SceneNode, key: string): string | undefined {
  const css: Partial<Record<string, string>> = n.css
  return css[key]
}

function collect(
  scene: Scene,
  measure: (id: string) => Box | null,
  probe: StyleProbe
): { entries: Entry[]; byId: Map<string, Entry> } {
  const entries: Entry[] = []
  const byId = new Map<string, Entry>()
  const visit = (
    n: SceneNode,
    key: PaintKey,
    opacityChain: number,
    ancestorIds: Set<string>,
    colorDecl: string | undefined
  ) => {
    if (n.hidden) return
    if (cssVal(n, "display")?.trim() === "none") return
    const ownOpacity =
      probe(n.id)?.opacity ?? Number.parseFloat(cssVal(n, "opacity") ?? "1")
    const chain = opacityChain * (Number.isFinite(ownOpacity) ? ownOpacity : 1)
    if (chain <= 0) return
    const box = measure(n.id)
    const decl = cssVal(n, "color") ?? colorDecl
    if (box && box.w > 0 && box.h > 0) {
      const e: Entry = {
        n,
        box,
        key,
        opacityChain: chain,
        ancestorIds,
        colorDecl: decl,
      }
      entries.push(e)
      byId.set(n.id, e)
    }
    const nextAncestors = new Set(ancestorIds)
    nextAncestors.add(n.id)
    n.children?.forEach((c, i) => {
      const z = Number.parseInt(cssVal(c, "zIndex") ?? "0", 10) || 0
      visit(c, [...key, z, i], chain, nextAncestors, decl)
    })
  }
  visit(scene.root, [0, 0], 1, new Set(), cssVal(scene.root, "color"))
  return { entries, byId }
}

// --- text specifics -------------------------------------------------------------

/** A text-shadow/stroke that guarantees a readable glyph edge on ANY backdrop:
 *  a tight, near-opaque halo whose color contrasts with the fill. Rescued
 *  nodes are never flagged and skip tier 2 entirely. */
export function shadowRescues(
  p: ProbedStyle,
  textColor: Rgba,
  required: number,
  parse: ColorParser
): boolean {
  if (p.textStrokeWidthPx >= 1) {
    const stroke = parse(p.textStrokeColor)
    if (
      stroke &&
      stroke.a >= 0.6 &&
      contrastRatio(textColor, { ...stroke, a: 1 }) >= required
    ) {
      return true
    }
  }
  const raw = p.textShadow
  if (!raw || raw === "none") return false
  for (const seg of splitList(raw)) {
    const color = extractColor(seg, parse)
    if (!color || color.a < 0.6) continue
    const lengths = (seg.match(/-?\d*\.?\d+px/g) ?? []).map((v) =>
      Number.parseFloat(v)
    )
    const [dx = 0, dy = 0, blur = 0] = lengths
    const maxBlur = Math.max(8, p.fontSizePx * 0.25)
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || blur > maxBlur) continue
    if (contrastRatio(textColor, { ...color, a: 1 }) >= required) return true
  }
  return false
}

/** Split a css list on top-level commas (commas inside rgb()/gradients stay). */
function splitList(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === "," && depth === 0) {
      out.push(value.slice(start, i))
      start = i + 1
    }
  }
  out.push(value.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Pull the first parsable color out of a css fragment (shadow segment or
 *  gradient stop) — functional colors, hex, or a bare named color token. */
function extractColor(fragment: string, parse: ColorParser): Rgba | null {
  const fn = fragment.match(
    /(?:rgba?|hsla?|oklch|oklab|lab|lch|color|hwb)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}/
  )
  if (fn) return parse(fn[0])
  for (const word of fragment.split(/\s+/)) {
    if (/^-?\d|px$|%$|deg$/.test(word)) continue
    const c = parse(word)
    if (c) return c
  }
  return null
}

/** Color stops of a gradient-filled text (background-clip: text). */
function gradientStops(raw: string, parse: ColorParser): Rgba[] {
  const stops: Rgba[] = []
  const inner = raw.replace(/^[^(]*\(/, "").replace(/\)\s*$/, "")
  for (const seg of splitList(inner)) {
    const c = extractColor(seg, parse)
    if (c) stops.push(c)
  }
  return stops
}

const ref = (n: SceneNode): string =>
  n.role ? `#${n.id} (${n.role})` : `#${n.id}`

const hex = (c: Rgba): string => {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

const fmtRatio = (r: number) => `${(Math.round(r * 10) / 10).toFixed(1)}:1`

function tokenOf(decl: string | undefined): string | undefined {
  return decl?.match(/var\(\s*(--[\w-]+)/)?.[1]
}

function suggestFor(
  textToken: string | undefined,
  backdrop: Backdrop
): ContrastSuggest {
  if (textToken) return "swap-token"
  return backdrop.kind === "solid" ? "adjust-lightness" : "scrim"
}

// --- the lint --------------------------------------------------------------------

export function lintContrast(
  scene: Scene,
  measure: (id: string) => Box | null,
  probe: StyleProbe,
  parse: ColorParser,
  opts: ContrastOptions = {}
): { findings: ContrastFinding[]; deferred: DeferredCheck[] } {
  const findings: ContrastFinding[] = []
  const deferred: DeferredCheck[] = []
  const { entries } = collect(scene, measure, probe)

  // Element-scope effects restyle their targets' rendered ink; canvas-scope
  // effects reprocess the whole frame — including any text they don't protect.
  // Both make css color math unreliable for the affected text, so those nodes
  // are judged by the ink-diff pixel sampler instead of being trusted or
  // (worse) skipped: looks routinely put a filter on EVERY text node.
  const effectTargets = new Set<string>()
  let canvasEffect = false
  for (const fx of scene.effects) {
    if (!fx.enabled) continue
    if (fx.target.type === "canvas" || fx.kind === "scene-shader") {
      canvasEffect = true
    }
    if (fx.target.type === "elements") {
      for (const id of fx.target.ids) effectTargets.add(id)
    }
  }
  // Nodes escaping the full-frame passes (composite crisp above them) keep a
  // trustworthy css ink color; everything else under a canvas effect doesn't.
  const crisp = canvasEffect ? protectedIds(scene) : new Set<string>()

  // allowLowContrast opts out a subtree, like allowOverlap in lint.ts.
  const optedOut = new Set<string>()
  const markOptOut = (n: SceneNode, inherited: boolean) => {
    const on = inherited || !!n.allowLowContrast
    if (on) optedOut.add(n.id)
    n.children?.forEach((c) => markOptOut(c, on))
  }
  markOptOut(scene.root, false)

  const sceneBg = parse(resolveVars(scene.background, scene.theme.tokens))

  for (const e of entries) {
    const T = e.n
    if (!isTextBearing(T)) continue
    if (optedOut.has(T.id)) continue
    if (cssVal(T, "transform")?.includes("rotate")) continue // AABB would lie
    const p = probe(T.id)
    if (!p) continue
    if (e.opacityChain < 0.05) continue // invisible — not a contrast problem

    const required =
      opts.requiredOverride ?? requiredRatio(p.fontSizePx, p.fontWeight)

    // Is this text's RENDERED ink styled by effects (element shader/filter on
    // the node, or a full-frame pass it isn't protected from)? Then css color
    // math — including the shadow-rescue rule — can't be trusted; the ink-diff
    // sampler judges the real pixels.
    const styledInk =
      effectTargets.has(T.id) || (canvasEffect && !crisp.has(T.id))

    // Effective fill color(s): the plain color, or every stop of a
    // gradient-filled clip-text.
    let textColors: Rgba[]
    let clipText = false
    if (p.backgroundClipText && p.backgroundImage !== "none") {
      clipText = true
      const raw = resolveVars(
        cssVal(T, "backgroundImage") ??
          cssVal(T, "background") ??
          p.backgroundImage,
        scene.theme.tokens
      )
      textColors = gradientStops(raw, parse)
    } else {
      const c = parse(p.color)
      textColors = c ? [c] : []
    }
    textColors = textColors.map((c) => ({ ...c, a: c.a * e.opacityChain }))
    const primary: Rgba | undefined = textColors.length
      ? textColors[0]
      : undefined
    const textToken = clipText ? undefined : tokenOf(e.colorDecl)

    const defer = (reason: BackdropReason, pixelInk = false) => {
      deferred.push({
        id: T.id,
        box: e.box,
        textColors,
        required,
        reason,
        pixelInk,
        ref: ref(T),
        textColorCss: clipText ? "gradient" : primary ? hex(primary) : "styled",
        textToken,
      })
    }

    // Styled ink (and gradient fills whose stops didn't parse): judged purely
    // from rendered pixels.
    if (styledInk) {
      defer("styled-ink", true)
      continue
    }
    if (!textColors.length) {
      defer(clipText ? "clip-text" : "styled-ink", true)
      continue
    }

    // A qualifying halo/stroke guarantees the glyph edge on any backdrop.
    if (
      textColors.every((c) => shadowRescues(p, { ...c, a: 1 }, required, parse))
    ) {
      continue
    }

    // A canvas-wide effect reprocesses everything under the text — only the
    // composited pixels can say what's really behind it. (The text itself is
    // protected/crisp here, so its css ink stays valid.)
    if (canvasEffect) {
      defer("effect")
      continue
    }

    // --- composite the backdrop stack, topmost first ------------------------
    let acc: Rgba = { r: 0, g: 0, b: 0, a: 0 }
    let backdrop: { kind: "complex"; reason: BackdropReason } | null = null

    // The text node's own background is the nearest layer (badge/cta plates).
    // For clip-text the background IS the fill, not a backdrop.
    if (!clipText) {
      if (p.backgroundImage !== "none") {
        backdrop = {
          kind: "complex",
          reason: p.backgroundImage.includes("url(") ? "image" : "gradient",
        }
      } else {
        const bg = parse(p.backgroundColor)
        if (bg && bg.a > 0) {
          acc = compositeOver(acc, { ...bg, a: bg.a * e.opacityChain })
        }
      }
    }

    if (!backdrop && acc.a < 0.999) {
      const under = entries
        .filter(
          (u) =>
            u.n.id !== T.id &&
            !u.ancestorIds.has(T.id) &&
            comparePaint(u.key, e.key) < 0 &&
            intersects(u.box, e.box)
        )
        .sort((a, b) => comparePaint(b.key, a.key)) // topmost first

      for (const u of under) {
        if (acc.a >= 0.999) break
        const up = probe(u.n.id)
        if (u.n.image) {
          backdrop = { kind: "complex", reason: "image" }
          break
        }
        if (effectTargets.has(u.n.id)) {
          backdrop = { kind: "complex", reason: "effect" }
          break
        }
        if (up && up.backgroundImage !== "none") {
          backdrop = {
            kind: "complex",
            reason: up.backgroundImage.includes("url(") ? "image" : "gradient",
          }
          break
        }
        const bg = up
          ? parse(up.backgroundColor)
          : parse(
              resolveVars(
                cssVal(u.n, "backgroundColor") ??
                  cssVal(u.n, "background") ??
                  "",
                scene.theme.tokens
              )
            )
        if (!bg || bg.a <= 0) continue
        if (!contains(u.box, e.box)) {
          backdrop = { kind: "complex", reason: "partial" }
          break
        }
        acc = compositeOver(acc, { ...bg, a: bg.a * u.opacityChain })
      }
    }

    if (!backdrop && acc.a < 0.999) {
      if (sceneBg) {
        acc = { ...compositeOver(acc, { ...sceneBg, a: 1 }), a: 1 }
      } else {
        backdrop = { kind: "complex", reason: "gradient" }
      }
    }

    if (backdrop) {
      defer(backdrop.reason)
      continue
    }

    // --- solid verdict -------------------------------------------------------
    const bg: Rgba = { ...acc, a: 1 }
    let worst = Infinity
    for (const c of textColors) {
      worst = Math.min(worst, contrastRatio(compositeOver(c, bg), bg))
    }
    if (worst >= required - RATIO_SLACK) continue

    const inkCss = clipText ? "gradient" : hex(textColors[0])
    findings.push({
      kind: "low-contrast",
      ids: [T.id],
      message: `${ref(T)} — ${fmtRatio(worst)} ${inkCss} text on ${hex(bg)}; needs ${fmtRatio(required)}`,
      detail: {
        ratio: worst,
        required,
        textColor: inkCss,
        textToken,
        backdrop: { kind: "solid", color: bg },
        suggest: suggestFor(textToken, { kind: "solid", color: bg }),
      },
    })
  }

  return { findings, deferred }
}

/** Tier-2 verdict → the same finding shape tier 1 emits. */
export function verdictToFinding(
  check: DeferredCheck,
  verdict: SampleVerdict
): ContrastFinding | null {
  if (verdict.pass) return null
  const backdrop: Backdrop = {
    kind: "complex",
    reason: check.reason,
    median: verdict.medianBackdrop,
  }
  const region =
    check.reason === "image"
      ? "photo region"
      : check.reason === "effect"
        ? "effected region"
        : check.reason === "partial"
          ? "partially covered region"
          : check.reason === "styled-ink"
            ? "backdrop (effect-styled text, judged from rendered pixels)"
            : "gradient region"
  const tone =
    relativeLuminance(verdict.medianBackdrop) >= 0.5 ? "light" : "dark"
  // The sampler measured the REAL rendered ink — more truthful than css.
  const inkCss = verdict.ink ? hex(verdict.ink) : check.textColorCss
  return {
    kind: "low-contrast",
    ids: [check.id],
    message: `${check.ref} — ${fmtRatio(verdict.worstRatio)} ${inkCss} text over a ${tone} ${region}; needs ${fmtRatio(check.required)}`,
    detail: {
      ratio: verdict.worstRatio,
      required: check.required,
      textColor: check.textColorCss,
      inkColor: verdict.ink ? hex(verdict.ink) : undefined,
      textToken: check.textToken,
      backdrop,
      suggest: suggestFor(
        check.reason === "styled-ink" ? undefined : check.textToken,
        backdrop
      ),
    },
  }
}

/** Findings → capped `contrast:` lines for the agent diff / tool chip. */
export function contrastText(findings: ContrastFinding[], max = 6): string[] {
  if (!findings.length) return []
  const lines = findings.slice(0, max).map((f) => `contrast: ${f.message}`)
  if (findings.length > max) {
    lines.push(`contrast: …and ${findings.length - max} more`)
  }
  lines.push(
    "contrast: fix by recoloring the text (element.setStyle color — var(--ink) or a darker/lighter literal), a scrim behind it, or a tight text-shadow halo; set allowLowContrast:true only for intentional decorative text"
  )
  return lines
}

/** Findings → the chat message the "Fix with AI" button sends. Specific per
 *  issue (measured ratio, rendered ink, backdrop kind, suggested move) so the
 *  model fixes readability without guessing at what's wrong. */
export function contrastFixPrompt(findings: ContrastFinding[]): string {
  const lines = findings.map((f) => {
    const hint =
      f.detail.suggest === "swap-token"
        ? `try color: var(--ink) or another high-contrast token (current token: ${f.detail.textToken ?? "?"})`
        : f.detail.suggest === "adjust-lightness"
          ? "recolor the text lighter/darker, keeping its hue"
          : f.detail.suggest === "scrim"
            ? "add or strengthen a scrim/plate behind the text, or recolor it"
            : "add a tight contrasting text-shadow halo"
    return `- ${f.message} → ${hint}`
  })
  return [
    "Fix these text readability issues (low contrast against what's behind the text). Keep the design intent — change as little as possible:",
    ...lines,
    "Use element.setStyle (color / textShadow), element.create for a scrim behind the text, or element.setAllowLowContrast {allow:true} ONLY if the low contrast is clearly intentional decorative type. Verify with the contrast warnings after your edits.",
  ].join("\n")
}
