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

import type { Scene, SceneNode } from "../../scene/types"
import type {
  Box,
  EnginePatch,
  RendererBackend,
  RendererCapabilities,
  UnitSampler,
} from "../backend"
import type { CompiledUnits } from "./paint-units"
import { walk } from "../../scene/model"
import { detectCapabilities } from "../backend"
import { buildNodeEl, imageTracker } from "./build"
import { Compositor } from "./compositor"
import { classifyPatches, nodeForId, restyleEl } from "./dom-patch"
import { currentDpr, sizeSceneCanvas } from "./dpr"
import { FrameLoop } from "./loop"
import { MeasurementHost } from "./measure"
import { compileUnits, pinUnitEl, unitRootIds } from "./paint-units"

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
    // (Runtime-guarded: jsdom has no FontFaceSet.)
    const fonts = (document as { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => this.refreshMeasurements()).catch(() => {})
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

  /** Incremental update after a dispatch transaction — the operation ladder
   *  from dom-patch.ts: restyle in place → rebuild one subtree → recompile
   *  units → full remount. Any restyle/rebuild re-measures (CSS can change
   *  layout: fontSize, padding…); capture caches invalidate wholesale —
   *  correctness first, per-unit dirtying is a profile-guided refinement. */
  applyTransaction(scene: Scene, patches: EnginePatch[]): void {
    if (!this.scene || !this.compiled) {
      this.setScene(scene)
      return
    }
    const prev = this.scene
    const targets = classifyPatches(scene, patches)
    this.scene = scene

    if (
      targets.remount ||
      prev.baseWidth !== scene.baseWidth ||
      prev.baseHeight !== scene.baseHeight
    ) {
      this.setScene(scene)
      return
    }
    if (!setsEqual(unitRootIds(scene), this.currentSplit())) {
      this.recompile()
      return
    }

    let mutated = false
    for (const id of targets.rebuild) {
      if (!this.rebuildNode(id)) {
        this.recompile()
        return
      }
      mutated = true
    }
    for (const id of targets.restyle) {
      if (targets.rebuild.has(id)) continue // fresh build already styled
      this.restyleNode(id)
      mutated = true
    }
    if (targets.sceneStyle) {
      this.applySceneStyle(scene)
      mutated = true
    }
    if (mutated) {
      this.refreshMeasurements() // re-measure + stale units + settle frame
    } else if (targets.stack) {
      this.compositor.markUnitsStale()
      this.loop.domMutated()
    }
  }

  /** Ids of the currently extracted (isolated) units. */
  private currentSplit(): Set<string> {
    return new Set(
      (this.compiled?.units ?? []).filter((u) => u.isolated).map((u) => u.id)
    )
  }

  /** Restyle one node's element in both DOM copies, preserving unit pins. */
  private restyleNode(id: string): void {
    const scene = this.scene!
    const node = nodeForId(scene, id)
    if (!node) return
    const hostEl = this.measurement.elOf(id)
    if (hostEl) restyleEl(hostEl, node)
    const canvasEl = this.compiled?.els.get(id)
    if (canvasEl) {
      const unit = this.compiled?.units.find((u) => u.id === id)
      restyleEl(
        canvasEl,
        node,
        unit ? (el) => pinUnitEl(el, unit.box) : undefined
      )
    }
  }

  /** Rebuild one node's subtree in both DOM copies. Returns false when the
   *  subtree hosts a paint-unit boundary (holes) — recompile instead. */
  private rebuildNode(id: string): boolean {
    const scene = this.scene!
    const compiled = this.compiled!
    const node = nodeForId(scene, id)
    if (!node) return false

    const split = unitRootIds(scene)
    if (split.size) {
      let touchesUnit = split.has(id)
      walk(node, (n: SceneNode) => {
        if (split.has(n.id)) touchesUnit = true
      })
      if (touchesUnit && id !== scene.root.id) return false
    }

    const hostEl = this.measurement.elOf(id)
    if (!hostEl) return false
    hostEl.replaceWith(
      buildNodeEl(node, {
        index: this.measurement.els,
        trackImage: this.measurement.trackImage,
      })
    )

    const canvasEl = compiled.els.get(id)
    if (!canvasEl) return false
    const holeBox = (hid: string) => {
      const b = this.measurement.boxOf(hid)
      return b ? { w: b.w, h: b.h } : null
    }
    const fresh = buildNodeEl(node, {
      index: compiled.els,
      trackImage: this.canvasImages.trackImage,
      holes: new Set([...split].filter((s) => s !== id)),
      holeBox,
    })
    canvasEl.replaceWith(fresh)
    const unit = compiled.units.find((u) => u.id === id)
    if (unit) {
      pinUnitEl(fresh, unit.box)
      unit.el = fresh
      unit.captured = false
    }
    return true
  }

  /** Theme vars / background / stylesheet on both DOM copies. */
  private applySceneStyle(scene: Scene): void {
    this.measurement.applySceneStyle(scene)
    const compiled = this.compiled!
    for (const [k, v] of Object.entries(scene.theme.tokens)) {
      this.canvas.style.setProperty(k, v)
    }
    compiled.styleEl.textContent = scene.stylesheet ?? ""
    compiled.bgEl.style.background = scene.background
  }

  /** Re-run the unit split against the current scene (both DOM copies stay,
   *  the canvas's flat unit list is rebuilt). */
  private recompile(): void {
    const scene = this.scene!
    this.measurement.setScene(scene)
    const boxes = this.measurement.measureAll()
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

  /** Re-read boxes after content-driven size changes (images, fonts, edits). */
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
    // Layout holes track their unit's measured size.
    for (const hole of this.canvas.querySelectorAll<HTMLElement>(
      "[data-hole]"
    )) {
      const b = boxes.get(hole.dataset.hole ?? "")
      if (b) {
        hole.style.width = `${b.w}px`
        hole.style.height = `${b.h}px`
      }
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

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
