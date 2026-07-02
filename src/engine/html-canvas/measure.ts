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
  private els = new Map<string, HTMLElement>()
  private boxes = new Map<string, Box>()
  private tracker: ReturnType<typeof imageTracker>

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
    for (const [k, v] of Object.entries(themeVars(scene.theme))) {
      this.el.style.setProperty(k, v)
    }
    this.els = new Map()
    const root = buildNodeEl(scene.root, {
      index: this.els,
      trackImage: this.tracker.trackImage,
    })
    this.el.replaceChildren(root)
  }

  /** Read every node's box relative to the host (forces a synchronous layout —
   *  called on structural changes only, never per frame). */
  measureAll(): Map<string, Box> {
    const hostRect = this.el.getBoundingClientRect()
    this.boxes = new Map()
    for (const [id, el] of this.els) {
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
