// DPR rules — the ONLY file allowed to reason about devicePixelRatio
// (docs/plan/02-performance.md §6). The traps, learned the hard way in v1:
//
//   1. drawElementImage maps CSS px → device px using devicePixelRatio ITSELF.
//      It must be called under an IDENTITY canvas transform — layering our own
//      setTransform(dpr) on top double-scales (≈dpr²) and flings content
//      off-frame on any retina / scaled display.
//   2. Therefore the whole pipeline works in DEVICE px: backing store =
//      CSS size × dpr, scratch copies and composites use device coordinates.
//   3. Export bypasses DPR entirely: the export canvas backing is the exact
//      format pixel size and dpr is forced to 1 (M5).

/** Screen dpr, clamped: beyond 2 the memory/fill cost outweighs sharpness. */
export function currentDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2)
}

/** Size a scene canvas: backing = CSS × dpr, CSS box pinned so layoutsubtree
 *  children lay out against the scene's CSS size, not the backing size. */
export function sizeSceneCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number
): void {
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
}

/** CSS px → device px for scratch/copy geometry. */
export function toDevice(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr)
}
