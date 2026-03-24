// ── M.store — SlideStore ──
// Manages slide lifecycle: create, switch, delete.

import { bus } from "./bus"
import type { SlideData } from "./types"

let _counter = 0
function uid(): string {
  return "s" + (++_counter) + "_" + Math.random().toString(36).slice(2, 8)
}

const SLIDE_BASE_CSS = `
  :host {
    display: block;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #ffffff;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .m-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 99999;
    display: none;
  }
  .m-grid.visible {
    display: block;
    background-image:
      linear-gradient(rgba(200,200,200,0.15) 1px, transparent 1px),
      linear-gradient(90deg, rgba(200,200,200,0.15) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  [data-ml]:empty::after {
    content: 'Drop elements here';
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: rgba(150,150,150,0.6);
    font-size: 13px;
    font-style: italic;
    pointer-events: none;
  }
  [data-ml] {
    border: 1.5px dashed rgba(150,150,150,0.35);
    border-radius: 4px;
    min-height: 60px;
  }
`

class SlideStore {
  slides: SlideData[] = []
  activeId: string | null = null
  bW = 1080
  bH = 1920
  private _container: HTMLElement | null = null

  setContainer(el: HTMLElement) {
    this._container = el
  }

  getContainer(): HTMLElement | null {
    return this._container
  }

  createSlide(name?: string): SlideData {
    const id = uid()
    const host = document.createElement("div")
    host.className = "m-slide-host"
    host.dataset.slideId = id
    host.style.cssText = `
      width: ${this.bW}px;
      height: ${this.bH}px;
      position: absolute;
      left: 0;
      top: 0;
      display: none;
    `

    const shadow = host.attachShadow({ mode: "open" })

    const styleEl = document.createElement("style")
    styleEl.textContent = SLIDE_BASE_CSS
    shadow.appendChild(styleEl)

    const gridEl = document.createElement("div")
    gridEl.className = "m-grid"
    shadow.appendChild(gridEl)

    const slide: SlideData = {
      id,
      host,
      shadow,
      styleEl,
      gridEl,
      name: name || `Slide ${this.slides.length + 1}`,
    }

    this.slides.push(slide)

    if (this._container) {
      this._container.appendChild(host)
    }

    if (this.slides.length === 1) {
      this.switchSlide(id)
    }

    bus.emit("slide:created", { slideId: id })
    return slide
  }

  switchSlide(id: string) {
    for (const s of this.slides) {
      s.host.style.display = s.id === id ? "block" : "none"
    }
    this.activeId = id
    bus.emit("slide:switched", { slideId: id })
  }

  deleteSlide(id: string) {
    const idx = this.slides.findIndex((s) => s.id === id)
    if (idx === -1 || this.slides.length <= 1) return

    const slide = this.slides[idx]
    slide.host.remove()
    this.slides.splice(idx, 1)

    if (this.activeId === id) {
      const newIdx = Math.min(idx, this.slides.length - 1)
      this.switchSlide(this.slides[newIdx].id)
    }

    bus.emit("slide:deleted", { slideId: id })
  }

  getSlide(id: string): SlideData | undefined {
    return this.slides.find((s) => s.id === id)
  }

  active(): SlideData | undefined {
    return this.activeId ? this.getSlide(this.activeId) : undefined
  }

  duplicateSlide(id: string): SlideData | undefined {
    const src = this.getSlide(id)
    if (!src) return undefined

    const newSlide = this.createSlide(src.name + " (copy)")
    const children = Array.from(src.shadow.children)
    for (const child of children) {
      if (child === src.styleEl || child === src.gridEl) continue
      newSlide.shadow.appendChild(child.cloneNode(true))
    }
    return newSlide
  }

  setBoardSize(w: number, h: number) {
    this.bW = w
    this.bH = h
    for (const s of this.slides) {
      s.host.style.width = w + "px"
      s.host.style.height = h + "px"
    }
    bus.emit("slide:resized", { w, h })
  }

  toggleGrid(visible: boolean) {
    for (const s of this.slides) {
      s.gridEl.classList.toggle("visible", visible)
    }
  }
}

export const store = new SlideStore()
