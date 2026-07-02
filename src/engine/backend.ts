// RendererBackend — the seam that isolates every platform assumption of the
// HTML-in-Canvas rendering bet (docs/plan/01-architecture.md §2). Everything
// above this interface (controller, agent, UI) is renderer-agnostic; the
// html-canvas implementation is the only code that knows about
// drawElementImage, paint records, or DPR. A future DOM-preview fallback or
// headless-export backend implements the same contract.

import type { Scene } from "../scene/types"

/** A rect in scene CSS px (the scene's baseWidth×baseHeight coordinate space). */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Per-frame transform sample for one paint unit, applied about the unit's
 *  center. Produced by the animator (M4); the dev harness plugs a hardcoded
 *  sampler to prove per-unit independence. */
export interface UnitSample {
  x: number
  y: number
  scale: number
  rotate: number // degrees
  opacity: number
}

export const IDENTITY_SAMPLE: UnitSample = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  opacity: 1,
}

/** Sample the motion state of a unit at time t (seconds). Return null for
 *  "no motion" (static fast path). Must be deterministic: same t → same value. */
export type UnitSampler = (tSec: number, unitId: string) => UnitSample | null

export interface RendererCapabilities {
  /** HTML-in-Canvas (drawElementImage) is available — the whole product gate. */
  liveCanvas: boolean
  /** WebGL2 for the effect pipeline (M3). */
  shaders: boolean
  /** WebCodecs for video export (M5). */
  video: boolean
}

export function detectCapabilities(): RendererCapabilities {
  if (typeof document === "undefined") {
    return { liveCanvas: false, shaders: false, video: false }
  }
  let liveCanvas = false
  let shaders = false
  try {
    const c = document.createElement("canvas")
    const ctx = c.getContext("2d")
    liveCanvas = !!ctx && (!!ctx.drawElementImage || !!ctx.drawElement)
    shaders = !!document.createElement("canvas").getContext("webgl2")
  } catch {
    /* capability probing must never throw */
  }
  const video = typeof VideoEncoder !== "undefined"
  return { liveCanvas, shaders, video }
}

export interface RendererBackend {
  readonly capabilities: RendererCapabilities
  /** The element to place in the editor's canvas well (the artboard). */
  readonly stage: HTMLElement
  mount: (host: HTMLElement) => void
  /** Full (re)mount of a scene. Incremental patching arrives with M1's
   *  dom-patch.ts — the single DOM writer this backend exposes. */
  setScene: (scene: Scene) => void
  /** Plug the per-unit motion sampler (animator in M4; harness stubs in M0). */
  setSampler: (sampler: UnitSampler | null) => void
  /** Keep rendering every frame (motion preview). Off = demand-driven idle. */
  setContinuous: (on: boolean) => void
  /** Schedule a repaint (content unchanged — e.g. an image finished loading). */
  invalidate: () => void
  /** Deterministic draw of the scene at time t. Same t → same pixels. */
  renderFrame: (tSec: number) => void
  /** Measured box of a node in scene px (from the measurement pass). */
  measure: (id: string) => Box | null
  /** Resolves when images are loaded, paint records settled, loop parked. */
  whenIdle: () => Promise<void>
  dispose: () => void
}
