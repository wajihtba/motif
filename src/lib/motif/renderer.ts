// ── M.renderer — OverlayRenderer ──
// Reads element positions from shadow DOM. Draws selection chrome as normal DOM.

import { kernel } from "./kernel"
import { meta } from "./meta"
import { store } from "./store"
import { viewport } from "./viewport"
import type { HandlePosition } from "./types"

const HANDLE_SIZE = 8
const ROTATE_OFFSET = 24

export interface OverlayHandle {
  pos: HandlePosition
  cx: number
  cy: number
}

class OverlayRenderer {
  private _overlay: HTMLElement | null = null
  private _selectionBox: HTMLElement | null = null
  private _handles: HTMLElement[] = []
  private _rotateHandle: HTMLElement | null = null
  private _rotateLine: HTMLElement | null = null
  private _containerBadges: HTMLElement[] = []
  private _dropIndicator: HTMLElement | null = null

  setOverlay(el: HTMLElement) {
    this._overlay = el
    this._buildDOM()
  }

  private _buildDOM() {
    if (!this._overlay) return
    this._overlay.innerHTML = ""

    this._selectionBox = document.createElement("div")
    this._selectionBox.className = "m-sel-box"
    this._selectionBox.style.cssText = `
      position: absolute; pointer-events: none; display: none;
      border: 1.5px solid #c9943e; z-index: 10;
    `
    this._overlay.appendChild(this._selectionBox)

    const positions: HandlePosition[] = [
      "tl", "tr", "bl", "br", "tm", "bm", "ml", "mr",
    ]
    this._handles = positions.map((pos) => {
      const h = document.createElement("div")
      h.className = "m-handle"
      h.dataset.handle = pos
      h.style.cssText = `
        position: absolute; display: none; z-index: 12;
        width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px;
        background: #c9943e; border: 1.5px solid #fff;
        border-radius: 50%; cursor: pointer;
        pointer-events: auto; transform: translate(-50%, -50%);
      `
      this._overlay!.appendChild(h)
      return h
    })

    this._rotateLine = document.createElement("div")
    this._rotateLine.style.cssText = `
      position: absolute; display: none; z-index: 11;
      width: 1px; background: #c9943e; pointer-events: none;
    `
    this._overlay.appendChild(this._rotateLine)

    this._rotateHandle = document.createElement("div")
    this._rotateHandle.className = "m-handle"
    this._rotateHandle.dataset.handle = "rotate"
    this._rotateHandle.style.cssText = `
      position: absolute; display: none; z-index: 12;
      width: 10px; height: 10px;
      background: #c9943e; border: 1.5px solid #fff;
      border-radius: 50%; cursor: grab;
      pointer-events: auto; transform: translate(-50%, -50%);
    `
    this._overlay.appendChild(this._rotateHandle)

    this._dropIndicator = document.createElement("div")
    this._dropIndicator.style.cssText = `
      position: absolute; display: none; z-index: 20;
      border: 2px dashed #3baa6f; border-radius: 4px;
      pointer-events: none; background: rgba(59,170,111,0.05);
    `
    this._overlay.appendChild(this._dropIndicator)
  }

  draw(
    selectedId: string | null,
    editing: boolean,
    containerHighlight?: { id: string; insertIdx?: number }
  ) {
    if (!this._overlay) return

    for (const badge of this._containerBadges) badge.remove()
    this._containerBadges = []

    this._drawContainerBadges()

    if (containerHighlight) {
      this._drawDropIndicator(containerHighlight.id, containerHighlight.insertIdx)
    } else {
      this._hideDropIndicator()
    }

    if (!selectedId) {
      this._hideSelection()
      return
    }

    const el = kernel.getElement(selectedId)
    if (!el) {
      this._hideSelection()
      return
    }

    const m = meta.get(selectedId)
    if (!m) {
      this._hideSelection()
      return
    }

    const rect = el.getBoundingClientRect()
    const vr = this._overlay.getBoundingClientRect()

    const left = rect.left - vr.left
    const top = rect.top - vr.top
    const width = rect.width
    const height = rect.height

    if (this._selectionBox) {
      this._selectionBox.style.display = "block"
      this._selectionBox.style.left = left + "px"
      this._selectionBox.style.top = top + "px"
      this._selectionBox.style.width = width + "px"
      this._selectionBox.style.height = height + "px"

      if (editing) {
        this._selectionBox.style.border = "1.5px dashed #5199d4"
      } else {
        this._selectionBox.style.border = "1.5px solid #c9943e"
      }
    }

    if (editing || m.locked) {
      for (const h of this._handles) h.style.display = "none"
      if (this._rotateHandle) this._rotateHandle.style.display = "none"
      if (this._rotateLine) this._rotateLine.style.display = "none"
      return
    }

    const handleCoords: Array<{ pos: HandlePosition; x: number; y: number }> = [
      { pos: "tl", x: left, y: top },
      { pos: "tr", x: left + width, y: top },
      { pos: "bl", x: left, y: top + height },
      { pos: "br", x: left + width, y: top + height },
      { pos: "tm", x: left + width / 2, y: top },
      { pos: "bm", x: left + width / 2, y: top + height },
      { pos: "ml", x: left, y: top + height / 2 },
      { pos: "mr", x: left + width, y: top + height / 2 },
    ]

    for (let i = 0; i < this._handles.length; i++) {
      const h = this._handles[i]
      const c = handleCoords[i]
      h.style.display = "block"
      h.style.left = c.x + "px"
      h.style.top = c.y + "px"

      const cursors: Record<HandlePosition, string> = {
        tl: "nwse-resize", tr: "nesw-resize",
        bl: "nesw-resize", br: "nwse-resize",
        tm: "ns-resize", bm: "ns-resize",
        ml: "ew-resize", mr: "ew-resize",
      }
      h.style.cursor = cursors[c.pos]
    }

    if (this._rotateHandle && this._rotateLine) {
      const rcx = left + width / 2
      const rcy = top - ROTATE_OFFSET
      this._rotateHandle.style.display = "block"
      this._rotateHandle.style.left = rcx + "px"
      this._rotateHandle.style.top = rcy + "px"

      this._rotateLine.style.display = "block"
      this._rotateLine.style.left = rcx + "px"
      this._rotateLine.style.top = rcy + "px"
      this._rotateLine.style.height = ROTATE_OFFSET + "px"
    }
  }

  private _hideSelection() {
    if (this._selectionBox) this._selectionBox.style.display = "none"
    for (const h of this._handles) h.style.display = "none"
    if (this._rotateHandle) this._rotateHandle.style.display = "none"
    if (this._rotateLine) this._rotateLine.style.display = "none"
  }

  private _drawContainerBadges() {
    if (!this._overlay) return

    const elements = kernel.getAllElements()
    for (const el of elements) {
      const id = el.getAttribute("data-m-id")
      if (!id) continue
      const m = meta.get(id)
      if (!m || m.type !== "container") continue

      const rect = el.getBoundingClientRect()
      const vr = this._overlay.getBoundingClientRect()

      const badge = document.createElement("div")
      badge.className = "m-container-badge"
      badge.textContent = m.containerType || "flex"
      badge.style.cssText = `
        position: absolute;
        left: ${rect.left - vr.left}px;
        top: ${rect.top - vr.top - 20}px;
        font-size: 10px;
        font-family: 'IBM Plex Mono', monospace;
        color: #3baa6f;
        background: rgba(59,170,111,0.15);
        padding: 1px 6px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 15;
      `
      this._overlay.appendChild(badge)
      this._containerBadges.push(badge)
    }
  }

  private _drawDropIndicator(containerId: string, insertIdx?: number) {
    if (!this._dropIndicator || !this._overlay) return

    const el = kernel.getElement(containerId)
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vr = this._overlay.getBoundingClientRect()

    this._dropIndicator.style.display = "block"
    this._dropIndicator.style.left = rect.left - vr.left + "px"
    this._dropIndicator.style.top = rect.top - vr.top + "px"
    this._dropIndicator.style.width = rect.width + "px"
    this._dropIndicator.style.height = rect.height + "px"
  }

  private _hideDropIndicator() {
    if (this._dropIndicator) this._dropIndicator.style.display = "none"
  }

  getHandleAt(x: number, y: number): HandlePosition | "rotate" | null {
    if (!this._overlay) return null

    if (this._rotateHandle && this._rotateHandle.style.display !== "none") {
      const r = this._rotateHandle.getBoundingClientRect()
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) {
        return "rotate"
      }
    }

    const positions: HandlePosition[] = [
      "tl", "tr", "bl", "br", "tm", "bm", "ml", "mr",
    ]
    for (let i = 0; i < this._handles.length; i++) {
      const h = this._handles[i]
      if (h.style.display === "none") continue
      const r = h.getBoundingClientRect()
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) {
        return positions[i]
      }
    }

    return null
  }
}

export const renderer = new OverlayRenderer()
