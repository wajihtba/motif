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
  ProbedStyle,
  RendererBackend,
  RendererCapabilities,
  UnitSampler,
} from "../backend"
import type { CompiledUnits } from "./paint-units"
import type { CompiledAnimations } from "../animator"
import { walk } from "../../scene/model"
import { compileAnimations, sampleAt } from "../animator"
import { detectCapabilities } from "../backend"
import { planEffects } from "../effect-plan"
import { buildNodeEl, imageTracker } from "./build"
import { Compositor } from "./compositor"
import { classifyPatches, nodeForId, restyleEl } from "./dom-patch"
import { currentDpr, sizeSceneCanvas } from "./dpr"
import { FrameLoop } from "./loop"
import { MeasurementHost } from "./measure"
import {
  compileUnits,
  inkOverflow,
  pinUnitContent,
  pinUnitEl,
  unitRootIds,
} from "./paint-units"

/** Frame-budget watchdog config (docs/plan/03-agent-first.md §5): two
 *  consecutive frames over budget auto-disable custom-GLSL layers. */
const FRAME_BUDGET_MS = 50

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
  private pendingFxT = 0
  private disposed = false
  private externalContinuous = false
  private overruns = 0
  private anims: CompiledAnimations = { byUnit: new Map(), active: false }
  private externalSampler: UnitSampler | null = null
  // Timeline playback: deterministic playhead; wall clock only anchors play.
  private playing = false
  private playAnchor: number | null = null // loop-t at which playhead was 0
  private playheadT = 0
  /** Fired when the frame budget is blown twice with custom GLSL present —
   *  the UI disables those layers and tells the agent/user. */
  onBudgetOverrun: ((layerIds: string[]) => void) | null = null

  constructor(private opts: { forceDpr?: number } = {}) {
    this.capabilities = detectCapabilities()
    this.stage = document.createElement("div")
    this.stage.dataset.motif = "stage"
    this.stage.style.position = "relative"
    this.canvas = document.createElement("canvas")
    this.canvas.setAttribute("layoutsubtree", "")
    this.stage.appendChild(this.canvas)

    this.measurement = new MeasurementHost(() => this.onImagesSettled())
    this.compositor = new Compositor(this.canvas)
    this.compositor.sampler = (t, unitId) =>
      this.externalSampler
        ? this.externalSampler(t, unitId)
        : sampleAt(this.anims, t, unitId)
    this.loop = new FrameLoop((t) => {
      // Advance the playhead from the rAF clock while playing; scrubbed or
      // paused frames render at the stored playhead (deterministic).
      if (this.playing) {
        if (this.playAnchor == null) this.playAnchor = t - this.playheadT
        const duration = this.scene?.timeline.duration ?? 5
        this.playheadT = (t - this.playAnchor) % Math.max(duration, 0.001)
      }
      this.pendingT = this.playheadT
      // Effect-layer clock: explicit playback pins effects to the playhead
      // (preview must match export); the ambient continuous loop (animated
      // effects, timeline parked) feeds them the rAF clock so they keep
      // moving. Demand-driven repaints (reduced motion, static scenes) stay
      // on the playhead — deterministic frames.
      this.pendingFxT =
        !this.playing && this.loop.isContinuous ? t : this.playheadT
      if (this.canvas.requestPaint) this.canvas.requestPaint()
      else this.compositor.compose(this.pendingT, this.pendingFxT)
    })
    if ("onpaint" in this.canvas) {
      this.canvas.onpaint = () => {
        if (this.disposed) return
        const started = performance.now()
        this.compositor.compose(this.pendingT, this.pendingFxT)
        this.watchBudget(performance.now() - started)
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
    // Export sessions force dpr=1: backing = exact format pixels.
    this.dpr = this.opts.forceDpr ?? currentDpr()
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
      this.canvasImages.trackImage,
      (id) => this.computedOf(id)
    )
    this.compositor.setContent(
      this.compiled.bgEl,
      this.compiled.units,
      this.dpr
    )
    this.replan()
    this.loop.domMutated()
  }

  /** Resolved computed style of a node's measurement-host copy — feeds the
   *  ink-overflow margins so shadows/filters aren't clipped by the scratch. */
  private computedOf(id: string): CSSStyleDeclaration | null {
    const el = this.measurement.elOf(id)
    return el ? getComputedStyle(el) : null
  }

  /** Resolved computed style for the contrast lint — inheritance, var(--token)
   *  and scene.stylesheet all applied by the browser on the measurement copy. */
  probeStyle(id: string): ProbedStyle | null {
    const s = this.computedOf(id)
    if (!s) return null
    const clip =
      s.getPropertyValue("-webkit-background-clip") || s.backgroundClip
    return {
      color: s.color,
      fontSizePx: Number.parseFloat(s.fontSize) || 16,
      fontWeight: Number.parseFloat(s.fontWeight) || 400,
      opacity: Number.parseFloat(s.opacity),
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage || "none",
      textShadow: s.textShadow || "none",
      textStrokeWidthPx:
        Number.parseFloat(s.getPropertyValue("-webkit-text-stroke-width")) || 0,
      textStrokeColor: s.getPropertyValue("-webkit-text-stroke-color"),
      backgroundClipText: clip.includes("text"),
    }
  }

  /** Recompute the effect plan + animations + loop continuity. */
  private replan(): void {
    if (!this.scene) return
    this.compositor.plan = planEffects(this.scene)
    this.anims = compileAnimations(this.scene)
    this.updateContinuous()
  }

  private updateContinuous(): void {
    // Ambient effect motion honours prefers-reduced-motion (frames render at
    // the static playhead). Explicit playback (play()) is user-initiated and
    // always runs.
    const ambient =
      Boolean(this.compositor.plan?.animated) && !prefersReducedMotion()
    this.loop.setContinuous(this.externalContinuous || this.playing || ambient)
  }

  // --- timeline playback (the animate preview + timeline UI drive these) ----

  play(): void {
    if (this.playing) return
    this.playing = true
    this.playAnchor = null // re-anchor on the next frame (resume from scrub)
    this.updateContinuous()
  }

  pause(): void {
    this.playing = false
    this.updateContinuous()
  }

  /** Deterministic scrub: renders exactly the frame at t. */
  seek(t: number): void {
    const duration = this.scene?.timeline.duration ?? 5
    this.playheadT = Math.max(0, Math.min(t, duration))
    this.playAnchor = null
    if (!this.playing) this.loop.invalidate()
  }

  get playhead(): number {
    return this.playheadT
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /** Whether the scene has any animation tracks (timeline is meaningful). */
  get hasAnimations(): boolean {
    return this.anims.active
  }

  /** Frame-budget watchdog: two consecutive over-budget frames disable the
   *  custom-GLSL layers (the usual culprits) via onBudgetOverrun. */
  private watchBudget(ms: number): void {
    if (ms <= FRAME_BUDGET_MS) {
      this.overruns = 0
      return
    }
    this.overruns += 1
    if (this.overruns < 2 || !this.scene) return
    this.overruns = 0
    const customIds = this.scene.effects
      .filter((l) => l.enabled && l.effect === "custom")
      .map((l) => l.id)
    if (customIds.length) this.onBudgetOverrun?.(customIds)
  }

  /** Sandbox-compile agent GLSL (wired into the normalize gate by the app). */
  validateGlsl(kind: "element" | "scene", frag: string): string | null {
    return this.compositor.pipeline()?.compileCheck(kind, frag) ?? null
  }

  // --- inline text editing ---------------------------------------------------
  // While a node is edited in a contenteditable overlay, its canvas-DOM copy
  // is visibility-hidden so the painted pixels don't double under the overlay.
  // The measurement copy stays visible-to-layout, so boxes keep measuring.
  private editingId: string | null = null

  setEditingNode(id: string | null): void {
    if (this.editingId && this.editingId !== id) {
      const prev = this.compiled?.els.get(this.editingId)
      if (prev) prev.style.visibility = ""
    }
    this.editingId = id
    if (id) {
      const el = this.compiled?.els.get(id)
      if (el) el.style.visibility = "hidden"
    }
    this.compositor.markUnitsStale()
    this.loop.domMutated()
  }

  /** The measurement-host element for a node — the overlay editor copies its
   *  computed text styles so editing looks like the painted result. */
  hostElOf(id: string): HTMLElement | null {
    return this.measurement.elOf(id)
  }

  /** Pointer in normalized canvas coords (pointer-following scene shaders). */
  setPointer(nx: number, ny: number): void {
    this.compositor.pointer = [nx, ny]
    if (this.compositor.plan?.scene.some((s) => s.def.pointer)) {
      this.loop.invalidate()
    }
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
    if (targets.stack || mutated) this.replan()
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
      // restyleEl wipes cssText, so re-pin: isolated units live inside a
      // wrapper (positioned by ink), the background unit at the origin.
      const pin = unit
        ? unit.isolated
          ? (el: HTMLElement) => pinUnitContent(el, unit.box, unit.ink)
          : (el: HTMLElement) => pinUnitEl(el, unit.box)
        : undefined
      restyleEl(canvasEl, node, pin)
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
      this.canvasImages.trackImage,
      (id) => this.computedOf(id)
    )
    this.compositor.setContent(
      this.compiled.bgEl,
      this.compiled.units,
      this.dpr
    )
    this.replan()
    this.loop.domMutated()
  }

  /** Override the animator (dev harness); null restores it. */
  setSampler(sampler: UnitSampler | null): void {
    this.externalSampler = sampler
    this.loop.invalidate()
  }

  setContinuous(on: boolean): void {
    this.externalContinuous = on
    this.updateContinuous()
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
    // Settled = all images decoded AND the loop parked — except in continuous
    // mode (animated effects/playback), where "settled" means content loaded;
    // the loop runs forever by design and must not block callers.
    const quiet = () =>
      this.measurement.pendingImages() === 0 &&
      this.canvasImages.pending() === 0 &&
      (this.loop.idle || this.loop.isContinuous)
    for (let i = 0; i < 240 && !quiet(); i++) {
      await nextFrame()
    }
    if (!this.loop.isContinuous) await this.loop.whenIdle()
  }

  /** Re-read boxes after content-driven size changes (images, fonts, edits). */
  private refreshMeasurements(): void {
    if (!this.scene || !this.compiled || this.disposed) return
    const boxes = this.measurement.measureAll()
    for (const unit of this.compiled.units) {
      const b = boxes.get(unit.id)
      if (b && unit.isolated) {
        unit.box = b
        // A restyle/content change may have moved the box or the shadow —
        // recompute ink, reposition the inner element, resize the wrapper.
        unit.ink = inkOverflow(this.computedOf(unit.id))
        const inner = this.compiled.els.get(unit.id)
        if (inner) pinUnitContent(inner, b, unit.ink)
        unit.el.style.width = `${unit.ink.l + b.w + unit.ink.r}px`
        unit.el.style.height = `${unit.ink.t + b.h + unit.ink.b}px`
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

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
