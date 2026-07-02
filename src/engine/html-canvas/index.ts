// HtmlCanvasBackend — the live HTML-in-Canvas implementation of the
// RendererBackend seam. Owns the four moving parts and their choreography:
//
//   MeasurementHost  full nested tree, hidden — the browser lays out, we read
//   paint-units      flat unit list as immediate canvas children (+ holes)
//   Compositor       capture (drawElementImage → scratch) + composite frames
//   FrameLoop        demand-driven rAF; knows the paint-record settle rule
//
// Drawing runs inside the canvas's paint callback (requestPaint → onpaint)
// when the platform provides it — paint records are freshest there — with a
// direct fallback otherwise.

import type { Scene } from "../../scene/types"
import type {
  Box,
  RendererBackend,
  RendererCapabilities,
  UnitSampler,
} from "../backend"
import type { CompiledUnits } from "./paint-units"
import { detectCapabilities } from "../backend"
import { imageTracker } from "./build"
import { Compositor } from "./compositor"
import { currentDpr, sizeSceneCanvas } from "./dpr"
import { FrameLoop } from "./loop"
import { MeasurementHost } from "./measure"
import { compileUnits } from "./paint-units"

export class HtmlCanvasBackend implements RendererBackend {
  readonly capabilities: RendererCapabilities
  readonly stage: HTMLElement
  readonly canvas: HTMLCanvasElement

  private measurement: MeasurementHost
  private compositor: Compositor
  private loop: FrameLoop
  private canvasImages = imageTracker(() => this.onImagesSettled())
  private scene: Scene | null = null
  private compiled: CompiledUnits | null = null
  private dpr = 1
  private pendingT = 0
  private disposed = false

  constructor() {
    this.capabilities = detectCapabilities()
    this.stage = document.createElement("div")
    this.stage.dataset.motif = "stage"
    this.stage.style.position = "relative"
    this.canvas = document.createElement("canvas")
    this.canvas.setAttribute("layoutsubtree", "")
    this.stage.appendChild(this.canvas)

    this.measurement = new MeasurementHost(() => this.onImagesSettled())
    this.compositor = new Compositor(this.canvas)
    this.loop = new FrameLoop((t) => {
      this.pendingT = t
      if (this.canvas.requestPaint) this.canvas.requestPaint()
      else this.compositor.compose(t)
    })
    if ("onpaint" in this.canvas) {
      this.canvas.onpaint = () => {
        if (!this.disposed) this.compositor.compose(this.pendingT)
      }
    }
    // Font swaps change metrics: re-measure once the font set settles.
    document.fonts.ready.then(() => this.refreshMeasurements()).catch(() => {})
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.stage)
    this.measurement.attach(document.body)
  }

  setScene(scene: Scene): void {
    this.scene = scene
    this.dpr = currentDpr()
    sizeSceneCanvas(this.canvas, scene.baseWidth, scene.baseHeight, this.dpr)
    this.stage.style.width = `${scene.baseWidth}px`
    this.stage.style.height = `${scene.baseHeight}px`

    this.measurement.attach(document.body)
    this.measurement.setScene(scene)
    const boxes = this.measurement.measureAll() // forces sync layout — rebuild only
    this.compiled = compileUnits(
      scene,
      this.canvas,
      (id) => boxes.get(id) ?? null,
      this.canvasImages.trackImage
    )
    this.compositor.setContent(
      this.compiled.bgEl,
      this.compiled.units,
      this.dpr
    )
    this.loop.domMutated()
  }

  setSampler(sampler: UnitSampler | null): void {
    this.compositor.sampler = sampler
    this.loop.invalidate()
  }

  setContinuous(on: boolean): void {
    this.loop.setContinuous(on)
  }

  invalidate(): void {
    this.loop.invalidate()
  }

  renderFrame(tSec: number): void {
    this.compositor.compose(tSec)
  }

  measure(id: string): Box | null {
    return this.measurement.boxOf(id)
  }

  async whenIdle(): Promise<void> {
    // Settled = all images decoded AND the loop parked. Image loads trigger
    // re-measure + repaint, so poll until a full quiet pass.
    const quiet = () =>
      this.measurement.pendingImages() === 0 &&
      this.canvasImages.pending() === 0 &&
      this.loop.idle
    for (let i = 0; i < 240 && !quiet(); i++) {
      await nextFrame()
    }
    await this.loop.whenIdle()
  }

  /** Re-read boxes after content-driven size changes (images, fonts). */
  private refreshMeasurements(): void {
    if (!this.scene || !this.compiled || this.disposed) return
    const boxes = this.measurement.measureAll()
    for (const unit of this.compiled.units) {
      const b = boxes.get(unit.id)
      if (b && unit.isolated) {
        unit.box = b
        unit.el.style.width = `${b.w}px`
        unit.el.style.height = `${b.h}px`
      }
      unit.captured = false
    }
    this.loop.domMutated()
  }

  private onImagesSettled(): void {
    this.refreshMeasurements()
  }

  /** Dev/debug introspection for the harness + budget overlay. */
  debugInfo(): { units: number; isolated: number; idle: boolean } {
    const units = this.compiled?.units ?? []
    return {
      units: units.length,
      isolated: units.filter((u) => u.isolated).length,
      idle: this.loop.idle,
    }
  }

  dispose(): void {
    this.disposed = true
    this.loop.dispose()
    this.measurement.dispose()
    if ("onpaint" in this.canvas) this.canvas.onpaint = null
    this.stage.remove()
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}
