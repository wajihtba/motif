// ── Motif Core Types ──

export interface ElementMeta {
  name: string
  locked: boolean
  visible: boolean
  type: "shape" | "text" | "image" | "html" | "component" | "container"
  placement: "free" | "flow"
  containerType?: "flex" | "grid"
  animation: null | Record<string, unknown>
  shader: null | Record<string, unknown>
  timeline: null | Record<string, unknown>
}

export interface SlideData {
  id: string
  host: HTMLDivElement
  shadow: ShadowRoot
  styleEl: HTMLStyleElement
  gridEl: HTMLDivElement
  name: string
}

export interface ComponentDef {
  name: string
  category: "layout" | "form" | "display"
  icon: string
  w: number
  h: number
  html: string
}

export type Tool =
  | "select"
  | "hand"
  | "text"
  | "rect"
  | "circle"
  | "image"
  | "html"
  | "flex"
  | "grid"

export type InteractionState =
  | "IDLE"
  | "SELECTED"
  | "DRAGGING"
  | "RESIZING"
  | "ROTATING"
  | "EDITING"

export type HandlePosition =
  | "tl"
  | "tr"
  | "bl"
  | "br"
  | "tm"
  | "bm"
  | "ml"
  | "mr"

export interface ExportOptions {
  format: "html" | "png" | "pdf" | "webm"
  scale: 1 | 2 | 3
}

export interface HistorySnapshot {
  slides: Array<{ id: string; html: string; name: string }>
  meta: Record<string, ElementMeta>
  activeSlideId: string | null
  selectedId: string | null
}
