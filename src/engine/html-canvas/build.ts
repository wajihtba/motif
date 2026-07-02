// DOM builder — SceneNode → real HTMLElement subtree. Used twice per scene:
// once for the hidden measurement host (full nested tree, the layout source of
// truth) and once for the canvas paint units (flat list with placeholder
// holes — see paint-units.ts). Both builds share this code so they can never
// disagree about what a node looks like.

import type { SceneNode } from "../../scene/types"
import { compileLayout } from "../../scene/layout"

export interface BuildOptions {
  /** Populated with node id → element for every node in the subtree. */
  index?: Map<string, HTMLElement>
  /** Called for each <img>; `done` fires on load OR error (never hangs). */
  trackImage?: (img: HTMLImageElement, done: () => void) => void
  /** Replace these node ids (not the subtree root itself) with layout
   *  placeholders — how extracted paint units leave holes behind. */
  holes?: Set<string>
  /** Measured hole sizes in scene px, for fixed-size placeholders. */
  holeBox?: (id: string) => { w: number; h: number } | null
}

/** Apply a node's compiled layout + free-form css onto an element. */
export function applyNodeStyle(el: HTMLElement, node: SceneNode): void {
  el.style.cssText = ""
  Object.assign(el.style, compileLayout(node.layout))
  el.style.boxSizing = "border-box"
  Object.assign(el.style, node.css)
  if (node.hidden) el.style.display = "none"
}

/** Build one node's DOM subtree. */
export function buildNodeEl(
  node: SceneNode,
  opts: BuildOptions = {},
  isRoot = true
): HTMLElement {
  // A nested unit root becomes a fixed-size, invisible placeholder: layout is
  // preserved (siblings don't reflow) but nothing double-paints — the unit
  // itself is painted separately from its own canvas child.
  if (!isRoot && opts.holes?.has(node.id)) {
    return buildPlaceholder(node, opts)
  }

  const el = document.createElement(node.tag || "div")
  el.className = "el"
  el.dataset.id = node.id

  if (node.image) {
    const img = document.createElement("img")
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: node.imageFit ?? "cover",
      display: "block",
    })
    if (opts.trackImage) {
      opts.trackImage(img, () => {})
    }
    img.src = node.image
    el.appendChild(img)
  }

  if (node.children?.length) {
    for (const child of node.children) {
      el.appendChild(buildNodeEl(child, opts, false))
    }
  } else if (node.html != null) {
    el.innerHTML = node.html
  }

  applyNodeStyle(el, node)
  opts.index?.set(node.id, el)
  return el
}

/** A hole where an extracted unit used to be: same positioning CSS, measured
 *  fixed size, visibility:hidden (keeps layout, paints nothing — unlike
 *  display:none, which would reflow siblings). */
function buildPlaceholder(node: SceneNode, opts: BuildOptions): HTMLElement {
  const el = document.createElement("div")
  el.className = "el unit-hole"
  el.dataset.hole = node.id
  applyNodeStyle(el, node)
  const box = opts.holeBox?.(node.id)
  if (box) {
    el.style.width = `${box.w}px`
    el.style.height = `${box.h}px`
  }
  el.style.visibility = "hidden"
  el.replaceChildren()
  return el
}

/** Wire image load tracking with a shared pending counter. */
export function imageTracker(onSettled: () => void): {
  trackImage: (img: HTMLImageElement, done: () => void) => void
  pending: () => number
} {
  let pending = 0
  const trackImage = (img: HTMLImageElement) => {
    pending += 1
    const done = () => {
      pending = Math.max(0, pending - 1)
      onSettled()
    }
    img.addEventListener("load", done, { once: true })
    img.addEventListener("error", done, { once: true })
  }
  return { trackImage, pending: () => pending }
}
