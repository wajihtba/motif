// Measurement pass — the browser does layout; we read boxes.
//
// A hidden host div renders the FULL nested scene tree with compiled layout
// CSS at baseWidth×baseHeight. getBoundingClientRect per node gives every
// box in scene px — feeding unit positioning, hit-testing, describe(), and
// selection overlays. The canvas DOM itself never gets measured: it holds
// only the flat unit list (paint-units.ts).
//
// visibility:hidden (not display:none) keeps layout live; position:fixed off-
// screen keeps it out of the viewport without affecting document flow.

import type { Scene } from "../../scene/types"
import type { Box } from "../backend"
import { themeVars } from "../../scene/theme"
import { buildNodeEl, imageTracker } from "./build"

export class MeasurementHost {
  readonly el: HTMLElement
  /** Node id → element. Shared with dom-patch (the single writer). */
  readonly els = new Map<string, HTMLElement>()
  private boxes = new Map<string, Box>()
  private tracker: ReturnType<typeof imageTracker>
  private styleEl = document.createElement("style")

  constructor(onImagesSettled: () => void) {
    this.el = document.createElement("div")
    this.el.dataset.motif = "measurement-host"
    Object.assign(this.el.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      contain: "strict",
      pointerEvents: "none",
    })
    this.tracker = imageTracker(onImagesSettled)
  }

  attach(parent: HTMLElement = document.body): void {
    if (!this.el.isConnected) parent.appendChild(this.el)
  }

  /** Rebuild the host tree for a scene. Synchronous; call measureAll() after. */
  setScene(scene: Scene): void {
    this.el.style.width = `${scene.baseWidth}px`
    this.el.style.height = `${scene.baseHeight}px`
    this.applySceneStyle(scene)
    this.els.clear()
    const root = buildNodeEl(scene.root, {
      index: this.els,
      trackImage: this.tracker.trackImage,
    })
    this.el.replaceChildren(this.styleEl, root)
  }

  /** Theme vars + shared stylesheet — layout in the host must see the same
   *  CSS the canvas paints with. */
  applySceneStyle(scene: Scene): void {
    for (const [k, v] of Object.entries(themeVars(scene.theme))) {
      this.el.style.setProperty(k, v)
    }
    this.styleEl.textContent = scene.stylesheet ?? ""
  }

  elOf(id: string): HTMLElement | null {
    return this.els.get(id) ?? null
  }

  get trackImage() {
    return this.tracker.trackImage
  }

  /** Read every node's box relative to the host (forces a synchronous layout —
   *  called on structural changes only, never per frame). */
  measureAll(): Map<string, Box> {
    const hostRect = this.el.getBoundingClientRect()
    this.boxes = new Map()
    for (const [id, el] of this.els) {
      if (!el.isConnected) {
        this.els.delete(id) // pruned by a subtree rebuild
        continue
      }
      const r = el.getBoundingClientRect()
      this.boxes.set(id, {
        x: r.left - hostRect.left,
        y: r.top - hostRect.top,
        w: r.width,
        h: r.height,
      })
    }
    return this.boxes
  }

  boxOf(id: string): Box | null {
    return this.boxes.get(id) ?? null
  }

  pendingImages(): number {
    return this.tracker.pending()
  }

  dispose(): void {
    this.el.remove()
  }
}
