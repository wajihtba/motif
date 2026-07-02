// Experimental HTML-in-Canvas API (Chromium, behind #canvas-draw-element /
// --enable-experimental-web-platform-features). Motif is built entirely on
// these; they aren't in the standard DOM lib yet.
//
// Platform constraints the engine encodes (docs/plan/01-architecture.md §3):
//   • only IMMEDIATE canvas children with a cached paint record can be drawn;
//   • paint records refresh only between rendering lifecycles (wait one rAF
//     after a DOM mutation before drawing);
//   • drawElementImage maps CSS px → device px using devicePixelRatio ITSELF,
//     so it must run under an identity canvas transform.
interface CanvasRenderingContext2D {
  drawElementImage?: (
    element: Element,
    x: number,
    y: number,
    w?: number,
    h?: number
  ) => DOMMatrix
  drawElement?: (
    element: Element,
    x: number,
    y: number,
    w?: number,
    h?: number
  ) => DOMMatrix
}
interface HTMLCanvasElement {
  requestPaint?: () => void
  onpaint?: (() => void) | null
}
