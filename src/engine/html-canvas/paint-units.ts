// The unit-splitting compiler — the fix for v1's fatal flaw.
//
// v1 painted the whole tree in one drawElementImage(rootEl) call (only
// immediate canvas children have paint records), so per-element transform /
// opacity — i.e. all animation — was impossible. v2 splits the scene into a
// FLAT list of paint units, each an absolutely-positioned immediate child of
// the <canvas layoutsubtree>, so every animated/effected element can be
// captured, transformed, and composited independently.
//
// Unit-splitting rule (docs/plan/01-architecture.md §5): a node becomes a
// unit root iff (a) it is targeted by any enabled AnimTrack, (b) it is
// targeted by any enabled element-scope EffectLayer, or (c) it is the scene
// root (the "background unit" holding everything not extracted). A unit
// contains its full nested subtree — arbitrary CSS nesting INSIDE a unit is
// fine; the platform only forbids drawing deep descendants directly.
//
// Where an extracted unit participated in flow layout, the background unit
// keeps a visibility:hidden placeholder at the measured size so siblings
// don't reflow and nothing double-paints (build.ts `holes`).
//
// This runs only on structural/targeting changes — never per frame.

import type { Box } from "../backend"
import type { FxTarget, Scene, SceneNode } from "../../scene/types"
import { findNode, nodesByRole, walk } from "../../scene/model"
import { themeVars } from "../../scene/theme"
import { buildNodeEl } from "./build"

export interface PaintUnit {
  /** Scene node id of the unit root ('root' for the background unit). */
  id: string
  /** Immediate child of the canvas, positioned at 0,0 with measured px size. */
  el: HTMLElement
  /** Measured box in scene CSS px — where the unit composites on the frame. */
  box: Box
  /** Extracted units compose via a captured scratch (transform/effects);
   *  the background unit takes the direct drawElementImage fast path. */
  isolated: boolean
  /** How far the unit's OWN box-shadow / filter paints beyond its border box,
   *  per side (scene CSS px). drawElementImage anchors an element's visual
   *  (ink) bounds — shadow included — so the capture scratch must grow by this
   *  or the shadow is clipped and the content drifts (see inkOverflow). */
  ink: InkOverflow
  /** Cached capture of the unit's pixels (device px). Invalidated by DOM
   *  patches, never by transform changes — a spinning badge re-uploads nothing. */
  scratch: HTMLCanvasElement | null
  captured: boolean
}

/** Per-side ink-overflow margin in scene CSS px (0 = none). */
export interface InkOverflow {
  l: number
  t: number
  r: number
  b: number
}

export const NO_INK: InkOverflow = { l: 0, t: 0, r: 0, b: 0 }

export interface CompiledUnits {
  /** Background fill (an element, because `background` is arbitrary CSS). */
  bgEl: HTMLElement
  /** The shared-stylesheet element in the canvas DOM. */
  styleEl: HTMLStyleElement
  /** Paint order: background unit first, then extracted units in DFS order. */
  units: PaintUnit[]
  /** Node id → canvas-DOM element (for dom-patch, the single DOM writer). */
  els: Map<string, HTMLElement>
}

/** Resolve an FxTarget to node ids (canvas-wide targets split no units). */
function targetIds(scene: Scene, target: FxTarget): string[] {
  if (target.type === "elements") return target.ids
  if (target.type === "role")
    return nodesByRole(scene, target.role).map((n) => n.id)
  return []
}

/** The set of node ids that must become their own paint units. */
export function unitRootIds(scene: Scene): Set<string> {
  const ids = new Set<string>()
  for (const track of scene.animations) {
    if (!track.enabled) continue
    for (const id of targetIds(scene, track.target)) ids.add(id)
  }
  for (const layer of scene.effects) {
    if (!layer.enabled || layer.kind === "scene-shader") continue
    for (const id of targetIds(scene, layer.target)) ids.add(id)
  }
  ids.delete(scene.root.id) // the root is always the background unit
  // Drop ids that don't exist (the normalize gate repairs most of these
  // upstream; the compiler must still never split on a ghost).
  for (const id of [...ids]) {
    if (!findNode(scene, id)) ids.delete(id)
  }
  return ids
}

/** Extracted unit roots in document (DFS) paint order, outermost first when
 *  units nest — an inner unit leaves a hole inside the outer unit's subtree. */
function orderedUnitRoots(scene: Scene, roots: Set<string>): SceneNode[] {
  const out: SceneNode[] = []
  walk(scene.root, (n) => {
    if (n.id !== scene.root.id && roots.has(n.id)) out.push(n)
  })
  return out
}

/** Build the canvas DOM (flat unit list) and the unit table. `measure` is the
 *  measurement pass result — units are positioned by measured boxes. */
export function compileUnits(
  scene: Scene,
  canvas: HTMLCanvasElement,
  measure: (id: string) => Box | null,
  trackImage?: (img: HTMLImageElement, done: () => void) => void,
  /** Resolved computed style for a node (the measurement host copy) — the
   *  source of truth for how far a unit's shadow/filter overflows its box. */
  computed?: (id: string) => CSSStyleDeclaration | null
): CompiledUnits {
  const roots = unitRootIds(scene)
  const els = new Map<string, HTMLElement>()
  const holeBox = (id: string) => {
    const b = measure(id)
    return b ? { w: b.w, h: b.h } : null
  }

  // Theme tokens go on the canvas itself so every unit inherits them
  // (var(--…) resolves in background and units alike).
  for (const [k, v] of Object.entries(themeVars(scene.theme))) {
    canvas.style.setProperty(k, v)
  }

  const styleEl = document.createElement("style")
  styleEl.textContent = scene.stylesheet ?? ""

  const bgEl = document.createElement("div")
  bgEl.className = "el bg-node"
  Object.assign(bgEl.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${scene.baseWidth}px`,
    height: `${scene.baseHeight}px`,
    background: scene.background,
  })

  // Background unit: the full tree with holes where extracted units live.
  const rootEl = buildNodeEl(scene.root, {
    index: els,
    trackImage,
    holes: roots,
    holeBox,
  })
  const rootBox: Box = { x: 0, y: 0, w: scene.baseWidth, h: scene.baseHeight }
  pinUnitEl(rootEl, rootBox)

  const units: PaintUnit[] = [
    {
      id: scene.root.id,
      el: rootEl,
      box: rootBox,
      isolated: false,
      ink: NO_INK, // the background unit paints direct — no scratch to clip.
      scratch: null,
      captured: false,
    },
  ]

  // Extracted units: each subtree rebuilt as its own immediate canvas child,
  // pinned at 0,0 with its measured px size (its own anchor CSS referenced the
  // old parent; inside the canvas it is positioned by the compositor instead).
  // Nested unit roots inside a unit become holes in it, exactly like the root.
  for (const node of orderedUnitRoots(scene, roots)) {
    // A zero/unknown box is NOT a reason to skip: content may simply not be
    // measurable yet (pending image, font swap) — the hole already exists in
    // the background unit, so skipping would vanish the node entirely.
    // refreshMeasurements() updates the box once content settles.
    const box = measure(node.id) ?? { x: 0, y: 0, w: 1, h: 1 }
    const innerHoles = new Set([...roots].filter((id) => id !== node.id))
    const el = buildNodeEl(node, {
      index: els,
      trackImage,
      holes: innerHoles,
      holeBox,
    })
    // Wrap the unit in a transparent, ink-padded container. The container has
    // no shadow of its own, so drawElementImage anchors it unambiguously; the
    // unit sits at a CSS-fixed (ink.l, ink.t) inside it, and its shadow paints
    // into the surrounding pad instead of being clipped at the capture edge.
    const ink = inkOverflow(computed?.(node.id) ?? null)
    pinUnitContent(el, box, ink)
    const wrapper = wrapUnitEl(el, box, ink)
    units.push({
      id: node.id,
      el: wrapper,
      box,
      isolated: true,
      ink,
      scratch: null,
      captured: false,
    })
  }

  canvas.replaceChildren(styleEl, bgEl, ...units.map((u) => u.el))
  return { bgEl, styleEl, units, els }
}

/** Per-side distance (CSS px) a unit's OWN box-shadow / filter paints beyond
 *  its border box. drawElementImage anchors an element's *visual* bounds (the
 *  shadow included) to the draw origin — so without this the capture scratch
 *  clips the shadow AND the content lands offset (the DOM preview shows the
 *  shadow; the canvas must match it). The compositor grows the scratch by these
 *  margins and re-derives where the border box sits inside it.
 *
 *  Reads getComputedStyle so stylesheet/look-driven shadows count too, not just
 *  inline node.css. jsdom returns empty strings here → all-zero (tests
 *  unaffected). Effect-plan drop-shadows are NOT included: those composite via
 *  the native shadow API onto the full frame and never touch the scratch. */
export function inkOverflow(cs: CSSStyleDeclaration | null): InkOverflow {
  if (!cs) return { ...NO_INK }
  const o = { l: 0, t: 0, r: 0, b: 0 }
  for (const sh of splitTopLevel(cs.boxShadow || "")) addShadowReach(o, sh)
  addFilterReach(o, cs.filter || "")
  // Round out (never in) and clamp so a pathological value can't balloon the
  // scratch to megapixels.
  const cap = (v: number) => Math.min(Math.max(0, Math.ceil(v)), 600)
  return { l: cap(o.l), t: cap(o.t), r: cap(o.r), b: cap(o.b) }
}

// A CSS blur radius B blurs with sigma = B/2; the gaussian is visually spent by
// ~3·sigma = 1.5·B. The wrapper pads by that so no visible shadow is clipped —
// over-padding is free (transparent pixels), under-padding clips the tail.
const BLUR_REACH = 1.5

/** Fold one computed `<color> offX offY blur spread` shadow into the per-side
 *  reach (inset shadows paint inside the box, so they overflow nothing). */
function addShadowReach(o: InkOverflow, shadow: string): void {
  if (/\binset\b/.test(shadow)) return
  const lens = [...shadow.matchAll(/(-?[\d.]+)px/g)].map((m) => parseFloat(m[1]))
  if (lens.length < 2) return
  const [ox, oy, blur = 0, spread = 0] = lens
  const ext = Math.max(0, blur) * BLUR_REACH + spread // spread may shrink (<0)
  o.l = Math.max(o.l, ext - ox)
  o.r = Math.max(o.r, ext + ox)
  o.t = Math.max(o.t, ext - oy)
  o.b = Math.max(o.b, ext + oy)
}

/** Fold a computed `filter` — drop-shadow() (offset+blur) and blur() (whose
 *  gaussian tail extends ≈3× its radius, symmetric) — into the per-side reach.
 *  Paren-aware so rgba() colours inside drop-shadow() don't truncate the scan. */
function addFilterReach(o: InkOverflow, filter: string): void {
  if (!filter || filter === "none") return
  let i = 0
  while (i < filter.length) {
    const open = filter.indexOf("(", i)
    if (open === -1) break
    const name = (filter.slice(i, open).trim().split(/\s+/).pop() ?? "").toLowerCase()
    let depth = 0
    let end = open
    for (; end < filter.length; end++) {
      if (filter[end] === "(") depth++
      else if (filter[end] === ")" && --depth === 0) break
    }
    const body = filter.slice(open + 1, end)
    const lens = [...body.matchAll(/(-?[\d.]+)px/g)].map((m) => parseFloat(m[1]))
    if (name === "drop-shadow" && lens.length >= 2) {
      const [ox, oy, blur = 0] = lens
      const ext = Math.max(0, blur) * BLUR_REACH
      o.l = Math.max(o.l, ext - ox)
      o.r = Math.max(o.r, ext + ox)
      o.t = Math.max(o.t, ext - oy)
      o.b = Math.max(o.b, ext + oy)
    } else if (name === "blur" && lens.length >= 1) {
      // filter blur(r): r IS the sigma (unlike box-shadow), so 3·sigma = 3r.
      const ext = Math.max(0, lens[0]) * 3
      o.l = Math.max(o.l, ext)
      o.r = Math.max(o.r, ext)
      o.t = Math.max(o.t, ext)
      o.b = Math.max(o.b, ext)
    }
    i = end + 1
  }
}

/** Split on top-level commas only (paren-aware: rgba(…) commas are ignored). */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "(") depth++
    else if (c === ")") depth = Math.max(0, depth - 1)
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Pin a unit element at the canvas origin with a fixed px size: capture
 *  always reads the (0,0,w,h) region; the compositor places it at its box.
 *  Used for the background unit (drawn direct) — isolated units are wrapped and
 *  positioned by pinUnitContent instead. */
export function pinUnitEl(el: HTMLElement, box: Box): void {
  Object.assign(el.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${box.w}px`,
    height: `${box.h}px`,
    margin: "0",
    transform: "none",
  })
}

/** Pin an isolated unit's element INSIDE its wrapper: same fixed box size, but
 *  offset by the ink margin so the shadow paints into the surrounding pad. The
 *  compositor reads back this exact (ink.l, ink.t) to place the unit — so it is
 *  correct no matter how far the browser's blur actually spreads. */
export function pinUnitContent(
  el: HTMLElement,
  box: Box,
  ink: InkOverflow
): void {
  Object.assign(el.style, {
    position: "absolute",
    left: `${ink.l}px`,
    top: `${ink.t}px`,
    width: `${box.w}px`,
    height: `${box.h}px`,
    margin: "0",
    transform: "none",
  })
}

/** Build the transparent, ink-padded wrapper that becomes the canvas child for
 *  an isolated unit. Its border box IS its visual box (no shadow of its own),
 *  and it fully contains the inner unit's shadow. */
export function wrapUnitEl(
  inner: HTMLElement,
  box: Box,
  ink: InkOverflow
): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "unit-wrap"
  Object.assign(wrap.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${ink.l + box.w + ink.r}px`,
    height: `${ink.t + box.h + ink.b}px`,
    margin: "0",
    transform: "none",
    overflow: "visible",
    background: "transparent",
  })
  wrap.appendChild(inner)
  return wrap
}
