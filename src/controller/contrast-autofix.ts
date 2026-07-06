// Contrast auto-fix — turns low-contrast findings (contrast-lint.ts) into
// concrete CommandCalls. Pure function, same layering as autofix.ts: scene +
// measure + findings in, calls out — headless in tests, identical for the
// editor toggle and the agent loop.
//
// The ladder per finding — first rung that PROVABLY reaches the required
// ratio wins, each candidate verified with the exact contrastRatio the lint
// re-checks with (a fix can never re-flag against the same backdrop):
//
//   1. token swap        — brand-preserving: --ink / --foreground /
//                          --primary-foreground, when the color came via var()
//   2. lightness adjust  — hue-preserving OKLCH L search toward the passing pole
//   3. scrim             — ("full" policy only) strengthen an existing scrim or
//                          insert a local plate behind the text
//   4. text halo         — a tight contrasting shadow that satisfies the lint's
//                          rescue rule on ANY backdrop (always reachable)
//
// Solid backdrops verify exactly; complex backdrops verify against the sampled
// median and are re-judged by the next tier-2 pass (the caller's bounded
// fix→measure→fix loop, same shape as layout auto-fix).

import type { Box } from "../engine/backend"
import type { Scene, SceneNode } from "../scene/types"
import type { Rgba } from "../lib/css-color"
import type { CommandCall } from "./dispatch"
import type { ColorParser, ContrastFinding } from "./contrast-lint"
import type { LintFinding } from "./lint"
import {
  adjustLightnessForContrast,
  compositeOver,
  contrastRatio,
  relativeLuminance,
} from "../lib/contrast"
import { boxToLayout } from "../scene/layout"
import { findNode, findParent } from "../scene/model"
import { resolveVars } from "./contrast-lint"

export type ContrastFixPolicy = "flag" | "safe" | "full"

/** Tokens tried for the swap rung, most-designed-for-this first — --ink is
 *  literally "high-contrast text over artwork" in the theme catalogue. */
const SWAP_TOKENS = ["--ink", "--foreground", "--primary-foreground"]

/** Local plate inflation around the text box (px). */
const SCRIM_PAD = 12
/** Alpha steps tried when inserting/strengthening a scrim. */
const SCRIM_ALPHAS = [0.55, 0.7, 0.85]

/** Runtime narrowing: contrast findings ride the shared LintFinding channel. */
export function isContrastFinding(f: LintFinding): f is ContrastFinding {
  return f.kind === "low-contrast" && "detail" in f
}

export interface AutofixContrastOptions {
  /** Node ids whose recolor rungs already failed once — escalate straight to
   *  the terminal halo/scrim rung. A caller-driven no-repeat guarantee: a rung
   *  that didn't stick is never tried a second time. */
  escalate?: Set<string>
}

/** True when the finding's rendered ink is effect/filter-styled — recoloring
 *  is unverifiable there, so the ladder starts at its terminal rung. */
export function isStyledInkFinding(f: ContrastFinding): boolean {
  return (
    f.detail.backdrop.kind === "complex" &&
    f.detail.backdrop.reason === "styled-ink"
  )
}

export function autofixContrast(
  scene: Scene,
  measure: (id: string) => Box | null,
  findings: ContrastFinding[],
  parse: ColorParser,
  policy: ContrastFixPolicy,
  opts: AutofixContrastOptions = {}
): CommandCall[] {
  if (policy === "flag") return []
  const calls: CommandCall[] = []
  const fixed = new Set<string>()

  for (const f of findings) {
    const id = f.ids[0]
    if (fixed.has(id)) continue
    const n = findNode(scene, id)
    if (!n || n.allowLowContrast) continue
    // Effect/filter-styled ink: css recoloring is unverifiable (the filter
    // transforms whatever we set), so skip the recolor rungs and go straight
    // to structural fixes, steering by the MEASURED rendered ink.
    const styled = isStyledInkFinding(f)
    const inkCss = f.detail.inkColor ?? f.detail.textColor
    // Gradient-filled type with parsable stops can't be recolored via `color`
    // and has no single fill to halo against — leave it for the human/LLM.
    if (inkCss === "gradient") continue
    const text = parse(inkCss)
    if (!text) continue
    const required = f.detail.required
    const backdrop =
      f.detail.backdrop.kind === "solid"
        ? f.detail.backdrop.color
        : f.detail.backdrop.median
    const terminalOnly = styled || opts.escalate?.has(id) === true

    const call =
      (terminalOnly
        ? null
        : (swapToken(scene, id, f, text, backdrop, required, parse) ??
          adjustLightness(id, text, backdrop, required))) ??
      (policy === "full"
        ? scrim(scene, measure, id, text, backdrop, required, parse)
        : null) ??
      halo(id, text, required)
    if (call) {
      calls.push(...(Array.isArray(call) ? call : [call]))
      fixed.add(id)
    }
  }
  return calls
}

/** Does `candidate` text provably read on `backdrop`? Complex backdrops
 *  without a sampled median can't be verified — treat as unknown (false). */
function passes(
  candidate: Rgba,
  backdrop: Rgba | undefined,
  required: number
): boolean {
  if (!backdrop) return false
  const bg = { ...backdrop, a: 1 }
  return contrastRatio(compositeOver(candidate, bg), bg) >= required
}

// --- rung 1: token swap ---------------------------------------------------------

function swapToken(
  scene: Scene,
  id: string,
  f: ContrastFinding,
  _text: Rgba,
  backdrop: Rgba | undefined,
  required: number,
  parse: ColorParser
): CommandCall | null {
  if (!f.detail.textToken) return null
  for (const token of SWAP_TOKENS) {
    if (token === f.detail.textToken) continue
    const raw = scene.theme.tokens[token]
    if (!raw) continue
    const resolved = parse(resolveVars(raw, scene.theme.tokens))
    if (!resolved || !passes(resolved, backdrop, required)) continue
    return {
      command: "element.setStyle",
      args: { id, css: { color: `var(${token})` } },
    }
  }
  return null
}

// --- rung 2: OKLCH lightness ------------------------------------------------------

function adjustLightness(
  id: string,
  text: Rgba,
  backdrop: Rgba | undefined,
  required: number
): CommandCall | null {
  if (!backdrop) return null
  const fixedColor = adjustLightnessForContrast(
    { ...text, a: 1 },
    { ...backdrop, a: 1 },
    required
  )
  if (!fixedColor) return null
  return {
    command: "element.setStyle",
    args: { id, css: { color: hex(fixedColor) } },
  }
}

// --- rung 3: scrim ---------------------------------------------------------------

function scrim(
  scene: Scene,
  measure: (id: string) => Box | null,
  id: string,
  text: Rgba,
  backdrop: Rgba | undefined,
  required: number,
  parse: ColorParser
): CommandCall | null {
  const box = measure(id)
  if (!box) return null
  const pole: Rgba =
    relativeLuminance(text) >= 0.5
      ? { r: 0, g: 0, b: 0, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 }

  // Pick the lightest alpha that provably reads over the sampled backdrop
  // (deeper scrims change the artwork more). Unverifiable → strongest.
  let alpha: number | null = backdrop
    ? null
    : SCRIM_ALPHAS[SCRIM_ALPHAS.length - 1]
  if (backdrop) {
    for (const a of SCRIM_ALPHAS) {
      const plate = compositeOver({ ...pole, a }, { ...backdrop, a: 1 })
      if (passes(text, plate, required)) {
        alpha = a
        break
      }
    }
  }
  if (alpha == null) return null

  // Strengthen an existing scrim already under the text before adding chrome.
  const existing = findScrimUnder(scene, measure, id, box)
  if (existing) {
    // css is Record<string,string> to the type system, but keys are sparse.
    const css: Partial<Record<string, string>> = existing.css
    const bg = parse(
      resolveVars(
        css.backgroundColor ?? css.background ?? "",
        scene.theme.tokens
      )
    )
    const nextA = Math.min(0.85, Math.max(alpha, (bg?.a ?? 0) + 0.15))
    const base = bg && bg.a > 0 ? bg : pole
    return {
      command: "element.setStyle",
      args: {
        id: existing.id,
        css: {
          background: `rgba(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)}, ${nextA})`,
        },
      },
    }
  }

  // Insert a local plate just below the text, inside the same parent.
  const parent = findParent(scene, id) ?? scene.root
  const parentBox =
    parent.id === scene.root.id
      ? { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight }
      : (measure(parent.id) ?? {
          x: 0,
          y: 0,
          w: scene.baseWidth,
          h: scene.baseHeight,
        })
  const index = parent.children?.findIndex((c) => c.id === id) ?? 0
  const layout = boxToLayout(
    box.x - SCRIM_PAD - parentBox.x,
    box.y - SCRIM_PAD - parentBox.y,
    box.w + SCRIM_PAD * 2,
    box.h + SCRIM_PAD * 2,
    parentBox.w,
    parentBox.h
  )
  return {
    command: "element.create",
    args: {
      parentId: parent.id === scene.root.id ? undefined : parent.id,
      index: Math.max(0, index),
      select: false,
      node: {
        role: "scrim",
        layout,
        css: {
          background: `rgba(${pole.r}, ${pole.g}, ${pole.b}, ${alpha})`,
          borderRadius: "var(--radius)",
        },
      },
    },
  }
}

/** A scrim-role sibling painting below the text and covering its box. */
function findScrimUnder(
  scene: Scene,
  measure: (id: string) => Box | null,
  textId: string,
  textBox: Box
): SceneNode | null {
  const parent = findParent(scene, textId)
  const siblings = parent?.children ?? []
  const textIndex = siblings.findIndex((c) => c.id === textId)
  for (let i = textIndex - 1; i >= 0; i--) {
    const s = siblings[i]
    if (s.role !== "scrim" || s.hidden) continue
    const b = measure(s.id)
    if (!b) continue
    const covers =
      b.x <= textBox.x + 2 &&
      b.y <= textBox.y + 2 &&
      b.x + b.w >= textBox.x + textBox.w - 2 &&
      b.y + b.h >= textBox.y + textBox.h - 2
    if (covers) return s
  }
  return null
}

// --- rung 4: text halo --------------------------------------------------------------

/** The pole farther from the text fill contrasts at least √21 ≈ 4.58:1 with
 *  it — enough for both WCAG thresholds — so a tight halo of that pole always
 *  satisfies the lint's rescue rule regardless of what's behind the glyphs. */
function halo(id: string, text: Rgba, required: number): CommandCall | null {
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 }
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 }
  const pole =
    contrastRatio(text, black) >= contrastRatio(text, white) ? black : white
  if (contrastRatio(text, pole) < required) return null
  const c = `rgba(${pole.r}, ${pole.g}, ${pole.b}, 0.9)`
  return {
    command: "element.setStyle",
    args: {
      id,
      css: { textShadow: `0 0 2px ${c}, 0 1px 3px ${c}, 0 0 8px ${c}` },
    },
  }
}

function hex(c: Rgba): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}
