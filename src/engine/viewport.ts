// Figma-style infinite-canvas navigation: pan (scroll / space-drag / middle-
// drag / empty-drag) and zoom (ctrl+wheel / pinch / buttons), centered on the
// cursor. Applies a single transform to the fit element; the artboard and the
// scene-px overlays inside it ride along, so interaction math only needs the
// zoom factor. Ported from v1 with a deps object instead of a renderer ref.

export interface ViewportDeps {
  /** Scene size to fit (reads live — format switches change it). */
  size: () => { width: number; height: number }
  onChange: (zoom: number) => void
}

export class Viewport {
  zoom = 1
  panX = 0
  panY = 0
  space = false
  panning = false
  /** True once the user has manually zoomed/panned — suppresses auto-refit on
   *  resize so we don't clobber a deliberate view. Cleared by fit/reset. */
  private userAdjusted = false
  private disposers: Array<() => void> = []

  constructor(
    private vp: HTMLElement,
    private fit: HTMLElement,
    private deps: ViewportDeps
  ) {
    Object.assign(fit.style, {
      position: "absolute",
      left: "0",
      top: "0",
      transformOrigin: "0 0",
    })
    vp.addEventListener("wheel", this.onWheel, { passive: false })
    vp.addEventListener("pointerdown", this.onDown)
    const keydown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e)) {
        this.space = true
        if (!this.panning) this.vp.style.cursor = "grab"
        e.preventDefault()
      }
    }
    const keyup = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.space = false
        if (!this.panning) this.vp.style.cursor = ""
      }
    }
    window.addEventListener("keydown", keydown)
    window.addEventListener("keyup", keyup)
    this.disposers.push(
      () => vp.removeEventListener("wheel", this.onWheel),
      () => vp.removeEventListener("pointerdown", this.onDown),
      () => window.removeEventListener("keydown", keydown),
      () => window.removeEventListener("keyup", keyup)
    )
  }

  getScale(): number {
    return this.zoom
  }

  private apply() {
    this.fit.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`
    this.deps.onChange(this.zoom)
  }

  fitToView() {
    const s = this.deps.size()
    const r = this.vp.getBoundingClientRect()
    const pad = 90
    // Guard against a not-yet-laid-out viewport (0×0) producing garbage scale.
    const fitW = r.width > pad ? (r.width - pad) / s.width : 1
    const fitH = r.height > pad ? (r.height - pad) / s.height : 1
    this.zoom = Math.max(0.05, Math.min(fitW, fitH, 1.5))
    this.userAdjusted = false
    this.center()
  }

  reset100() {
    this.zoom = 1
    this.userAdjusted = false
    this.center()
  }

  /** Re-fit when the viewport box resizes — unless the user owns the view. */
  handleResize() {
    if (!this.userAdjusted) this.fitToView()
  }

  private center() {
    const s = this.deps.size()
    const r = this.vp.getBoundingClientRect()
    this.panX = (r.width - s.width * this.zoom) / 2
    this.panY = (r.height - s.height * this.zoom) / 2
    this.apply()
  }

  zoomBy(factor: number) {
    const r = this.vp.getBoundingClientRect()
    this.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2)
  }

  private zoomAt(factor: number, clientX: number, clientY: number) {
    const r = this.vp.getBoundingClientRect()
    const x = clientX - r.left
    const y = clientY - r.top
    const nz = clamp(this.zoom * factor, 0.05, 8)
    const k = nz / this.zoom
    this.panX = x - (x - this.panX) * k
    this.panY = y - (y - this.panY) * k
    this.zoom = nz
    this.userAdjusted = true
    this.apply()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    } else {
      this.panX -= e.deltaX
      this.panY -= e.deltaY
      this.userAdjusted = true
      this.apply()
    }
  }

  private onDown = (e: PointerEvent) => {
    const onArt = (e.target as HTMLElement).closest('[data-motif="stage"]')
    const wantPan = e.button === 1 || this.space || (e.button === 0 && !onArt)
    if (!wantPan) return // artboard press → Interaction handles it
    e.preventDefault()
    this.panning = true
    this.vp.style.cursor = "grabbing"
    const sx = e.clientX
    const sy = e.clientY
    const px = this.panX
    const py = this.panY
    const move = (ev: PointerEvent) => {
      this.panX = px + (ev.clientX - sx)
      this.panY = py + (ev.clientY - sy)
      this.userAdjusted = true
      this.apply()
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.panning = false
      this.vp.style.cursor = this.space ? "grab" : ""
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  dispose() {
    for (const d of this.disposers) d()
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return (
    !!t &&
    (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")
  )
}
