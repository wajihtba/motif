// ── M.kernel — SlideKernel ──
// THE ONLY MODULE THAT TOUCHES SHADOW DOM.

import { bus } from "./bus"
import { meta } from "./meta"
import { store } from "./store"
import type { ComponentDef, ElementMeta } from "./types"

let _counter = 0
function uid(): string {
  return "m" + (++_counter) + "_" + Math.random().toString(36).slice(2, 8)
}

class SlideKernel {
  addNode(
    slideId: string,
    type: ElementMeta["type"],
    opts: {
      tag?: string
      style?: string
      html?: string
      x?: number
      y?: number
      w?: number
      h?: number
      name?: string
      parentId?: string
      insertIdx?: number
    } = {}
  ): string | null {
    const slide = store.getSlide(slideId)
    if (!slide) return null

    const id = uid()
    const el = document.createElement(opts.tag || "div")
    el.setAttribute("data-m-id", id)

    const isContainer = type === "container"
    const isFlow = !!opts.parentId

    if (isFlow) {
      el.style.cssText = `
        position: static;
        flex: 1;
        min-width: 0;
        min-height: 0;
        height: 100%;
        box-sizing: border-box;
        ${opts.style || ""}
      `
    } else {
      const x = opts.x ?? 100
      const y = opts.y ?? 100
      const w = opts.w ?? 200
      const h = opts.h ?? 150
      el.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${w}px;
        height: ${h}px;
        box-sizing: border-box;
        ${opts.style || ""}
      `
    }

    if (opts.html) {
      el.innerHTML = opts.html
    }

    if (isContainer) {
      const containerType = opts.name?.toLowerCase().includes("grid")
        ? "grid"
        : "flex"
      el.setAttribute("data-ml", containerType)
      el.style.display = containerType
      if (containerType === "flex") {
        el.style.flexDirection = "row"
        el.style.gap = "8px"
        el.style.padding = "8px"
        el.style.alignItems = "stretch"
      } else {
        el.style.gridTemplateColumns = "1fr 1fr"
        el.style.gap = "8px"
        el.style.padding = "8px"
        el.style.alignItems = "stretch"
      }
    }

    if (opts.parentId) {
      const parent = this.getElement(opts.parentId)
      if (parent) {
        if (
          opts.insertIdx !== undefined &&
          opts.insertIdx < parent.children.length
        ) {
          parent.insertBefore(el, parent.children[opts.insertIdx])
        } else {
          parent.appendChild(el)
        }
      } else {
        slide.shadow.appendChild(el)
      }
    } else {
      slide.shadow.appendChild(el)
    }

    meta.set(id, {
      name: opts.name || type.charAt(0).toUpperCase() + type.slice(1),
      locked: false,
      visible: true,
      type,
      placement: isFlow ? "flow" : "free",
      containerType: isContainer
        ? opts.name?.toLowerCase().includes("grid")
          ? "grid"
          : "flex"
        : undefined,
      animation: null,
      shader: null,
      timeline: null,
    })

    bus.emit("node:added", { id, type, slideId })
    return id
  }

  addComponent(
    slideId: string,
    def: ComponentDef,
    x: number,
    y: number,
    parentId?: string,
    insertIdx?: number
  ): string | null {
    const slide = store.getSlide(slideId)
    if (!slide) return null

    const id = uid()
    const el = document.createElement("div")
    el.setAttribute("data-m-id", id)

    if (parentId) {
      el.style.cssText = `
        position: static;
        flex: 1;
        min-width: 0;
        min-height: 0;
        height: 100%;
        box-sizing: border-box;
      `
    } else {
      el.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${def.w}px;
        height: ${def.h}px;
        box-sizing: border-box;
      `
    }

    el.innerHTML = def.html

    if (parentId) {
      const parent = this.getElement(parentId)
      if (parent) {
        if (insertIdx !== undefined && insertIdx < parent.children.length) {
          parent.insertBefore(el, parent.children[insertIdx])
        } else {
          parent.appendChild(el)
        }
      } else {
        slide.shadow.appendChild(el)
      }
    } else {
      slide.shadow.appendChild(el)
    }

    meta.set(id, {
      name: def.name,
      locked: false,
      visible: true,
      type: "component",
      placement: parentId ? "flow" : "free",
      animation: null,
      shader: null,
      timeline: null,
    })

    bus.emit("node:added", { id, type: "component", slideId })
    return id
  }

  getElement(nodeId: string): HTMLElement | null {
    const slide = store.active()
    if (!slide) return null
    return slide.shadow.querySelector(`[data-m-id="${nodeId}"]`)
  }

  getElementInSlide(slideId: string, nodeId: string): HTMLElement | null {
    const slide = store.getSlide(slideId)
    if (!slide) return null
    return slide.shadow.querySelector(`[data-m-id="${nodeId}"]`)
  }

  getAllIds(): string[] {
    const slide = store.active()
    if (!slide) return []
    const els = slide.shadow.querySelectorAll("[data-m-id]")
    return Array.from(els).map((el) => el.getAttribute("data-m-id")!)
  }

  getAllElements(): HTMLElement[] {
    const slide = store.active()
    if (!slide) return []
    return Array.from(slide.shadow.querySelectorAll("[data-m-id]"))
  }

  getTopLevelElements(): HTMLElement[] {
    const slide = store.active()
    if (!slide) return []
    return Array.from(slide.shadow.children).filter(
      (el) =>
        el instanceof HTMLElement &&
        el.hasAttribute("data-m-id")
    ) as HTMLElement[]
  }

  mutate(
    nodeId: string,
    changes: { style?: Record<string, string>; html?: string; attr?: Record<string, string> }
  ) {
    const el = this.getElement(nodeId)
    if (!el) return
    if (changes.style) {
      for (const [k, v] of Object.entries(changes.style)) {
        el.style.setProperty(k, v)
      }
    }
    if (changes.html !== undefined) {
      el.innerHTML = changes.html
    }
    if (changes.attr) {
      for (const [k, v] of Object.entries(changes.attr)) {
        el.setAttribute(k, v)
      }
    }
    bus.emit("node:mutated", { id: nodeId })
  }

  removeNode(nodeId: string) {
    const el = this.getElement(nodeId)
    if (!el) return

    const childIds = Array.from(el.querySelectorAll("[data-m-id]")).map(
      (c) => c.getAttribute("data-m-id")!
    )
    for (const cid of childIds) {
      meta.delete(cid)
    }

    el.remove()
    meta.delete(nodeId)
    bus.emit("node:removed", { id: nodeId })
  }

  reparentInto(nodeId: string, containerId: string, idx?: number) {
    const el = this.getElement(nodeId)
    const container = this.getElement(containerId)
    if (!el || !container) return

    el.style.position = "static"
    el.style.left = ""
    el.style.top = ""
    el.style.transform = ""
    el.style.flex = "1"
    el.style.minWidth = "0"
    el.style.minHeight = "0"
    el.style.height = "100%"
    el.style.width = ""

    if (idx !== undefined && idx < container.children.length) {
      container.insertBefore(el, container.children[idx])
    } else {
      container.appendChild(el)
    }

    meta.update(nodeId, { placement: "flow" })
    bus.emit("node:mutated", { id: nodeId, action: "reparent" })
  }

  detachFromLayout(nodeId: string) {
    const el = this.getElement(nodeId)
    if (!el) return

    const slide = store.active()
    if (!slide) return

    const rect = el.getBoundingClientRect()
    const hostRect = slide.host.getBoundingClientRect()

    const hostStyle = getComputedStyle(slide.host)
    const scaleMatch = hostStyle.transform.match(/scale\(([^)]+)\)/)
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1

    const x = (rect.left - hostRect.left) / scale
    const y = (rect.top - hostRect.top) / scale
    const w = rect.width / scale
    const h = rect.height / scale

    el.style.position = "absolute"
    el.style.left = x + "px"
    el.style.top = y + "px"
    el.style.width = w + "px"
    el.style.height = h + "px"
    el.style.flex = ""
    el.style.minWidth = ""
    el.style.minHeight = ""

    slide.shadow.appendChild(el)
    meta.update(nodeId, { placement: "free" })
    bus.emit("node:mutated", { id: nodeId, action: "detach" })
  }

  wrapInFlex(nodeId: string): string | null {
    const el = this.getElement(nodeId)
    if (!el) return null

    const slide = store.active()
    if (!slide) return null

    const x = parseFloat(el.style.left) || 0
    const y = parseFloat(el.style.top) || 0
    const w = parseFloat(el.style.width) || 200
    const h = parseFloat(el.style.height) || 150

    const containerId = this.addNode(slide.id, "container", {
      x,
      y,
      w: w + 16,
      h: h + 16,
      name: "Flex Container",
    })
    if (!containerId) return null

    this.reparentInto(nodeId, containerId)
    return containerId
  }

  reorder(nodeId: string, dir: "up" | "down") {
    const el = this.getElement(nodeId)
    if (!el || !el.parentElement) return

    const parent = el.parentElement
    if (dir === "up" && el.nextElementSibling) {
      parent.insertBefore(el.nextElementSibling, el)
    } else if (dir === "down" && el.previousElementSibling) {
      parent.insertBefore(el, el.previousElementSibling)
    }

    bus.emit("node:mutated", { id: nodeId, action: "reorder" })
  }

  serializeSlide(slideId: string): string {
    const slide = store.getSlide(slideId)
    if (!slide) return ""

    const clone = document.createElement("div")
    for (const child of Array.from(slide.shadow.children)) {
      if (child === slide.styleEl || child === slide.gridEl) continue
      clone.appendChild(child.cloneNode(true))
    }

    for (const el of clone.querySelectorAll("[data-m-id]")) {
      el.removeAttribute("data-m-id")
    }
    for (const el of clone.querySelectorAll("[data-ml]")) {
      el.removeAttribute("data-ml")
    }
    for (const el of clone.querySelectorAll("[contenteditable]")) {
      el.removeAttribute("contenteditable")
    }

    return clone.innerHTML
  }

  snapshotSlide(slideId: string): string {
    const slide = store.getSlide(slideId)
    if (!slide) return ""
    const parts: string[] = []
    for (const child of Array.from(slide.shadow.children)) {
      if (child === slide.styleEl || child === slide.gridEl) continue
      if (child instanceof HTMLElement) {
        parts.push(child.outerHTML)
      }
    }
    return parts.join("")
  }

  restoreSlide(slideId: string, html: string) {
    const slide = store.getSlide(slideId)
    if (!slide) return

    const toRemove: ChildNode[] = []
    for (const child of Array.from(slide.shadow.childNodes)) {
      if (child === slide.styleEl || child === slide.gridEl) continue
      toRemove.push(child)
    }
    for (const child of toRemove) child.remove()

    const temp = document.createElement("div")
    temp.innerHTML = html
    while (temp.firstChild) {
      slide.shadow.appendChild(temp.firstChild)
    }
  }
}

export const kernel = new SlideKernel()
