// ── M.viewport — ViewportController ──
// Manages zoom & pan of the canvas.

import { bus } from "./bus"
import { store } from "./store"

class ViewportController {
  zoom = 0.5
  panX = 0
  panY = 0
  private _wrapper: HTMLElement | null = null
  private _viewport: HTMLElement | null = null

  readonly MIN_ZOOM = 0.1
  readonly MAX_ZOOM = 3

  setElements(wrapper: HTMLElement, viewport: HTMLElement) {
    this._wrapper = wrapper
    this._viewport = viewport
    this.update()
  }

  update() {
    if (!this._wrapper) return
    this._wrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`
    this._wrapper.style.transformOrigin = "0 0"
    bus.emit("viewport:changed", {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    })
  }

  zoomTo(z: number, cx?: number, cy?: number) {
    const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, z))
    if (cx !== undefined && cy !== undefined) {
      const ratio = newZoom / this.zoom
      this.panX = cx - (cx - this.panX) * ratio
      this.panY = cy - (cy - this.panY) * ratio
    }
    this.zoom = newZoom
    this.update()
  }

  zoomIn() {
    this.zoomTo(this.zoom * 1.15)
  }

  zoomOut() {
    this.zoomTo(this.zoom / 1.15)
  }

  fit() {
    if (!this._viewport) return
    const vr = this._viewport.getBoundingClientRect()
    const padding = 60
    const scaleX = (vr.width - padding * 2) / store.bW
    const scaleY = (vr.height - padding * 2) / store.bH
    this.zoom = Math.min(scaleX, scaleY, 1)
    this.panX = (vr.width - store.bW * this.zoom) / 2
    this.panY = (vr.height - store.bH * this.zoom) / 2
    this.update()
  }

  screenToSlide(sx: number, sy: number): { x: number; y: number } {
    if (!this._viewport) return { x: 0, y: 0 }
    const vr = this._viewport.getBoundingClientRect()
    return {
      x: (sx - vr.left - this.panX) / this.zoom,
      y: (sy - vr.top - this.panY) / this.zoom,
    }
  }

  slideToScreen(x: number, y: number): { sx: number; sy: number } {
    if (!this._viewport) return { sx: 0, sy: 0 }
    const vr = this._viewport.getBoundingClientRect()
    return {
      sx: x * this.zoom + this.panX + vr.left,
      sy: y * this.zoom + this.panY + vr.top,
    }
  }

  getViewportRect(): DOMRect | null {
    return this._viewport?.getBoundingClientRect() ?? null
  }
}

export const viewport = new ViewportController()
