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
  /** Cached capture of the unit's pixels (device px). Invalidated by DOM
   *  patches, never by transform changes — a spinning badge re-uploads nothing. */
  scratch: HTMLCanvasElement | null
  captured: boolean
}

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
  trackImage?: (img: HTMLImageElement, done: () => void) => void
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
    pinUnitEl(el, box)
    units.push({
      id: node.id,
      el,
      box,
      isolated: true,
      scratch: null,
      captured: false,
    })
  }

  canvas.replaceChildren(styleEl, bgEl, ...units.map((u) => u.el))
  return { bgEl, styleEl, units, els }
}

/** Pin a unit element at the canvas origin with a fixed px size: capture
 *  always reads the (0,0,w,h) region; the compositor places it at its box. */
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
