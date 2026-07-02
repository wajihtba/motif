// Effects barrel — the single import surface for the rest of the app.
//
// Importing this module triggers every catalogue to self-register (the side
// effect of importing each kind's index), so any later get()/list()/groups()
// call sees a fully populated registry. The engine, the UI, and (later) the
// agent all go through here.

import "./scene-shaders"
import "./element-shaders"
import "./pixel"
import "./filters"
import "./anims"

import { get } from "./core/registry"
import type {
  AnimDef,
  ElementShaderDef,
  FilterDef,
  PixelDef,
  SceneShaderDef,
} from "./core/types"

export * from "./core/types"
export {
  register,
  registerAll,
  list,
  get,
  has,
  groups,
  allEffects,
  supportsOf,
  findEffect,
  EFFECT_KINDS,
  paramDefaults,
  packParams,
  toolSchema,
  type EffectGroup,
} from "./core/registry"

// Animation presets (the engine-driven motion layer; see engine/animator).
export {
  ANIM_PRESETS,
  animPreset,
  presetDefaults,
  presetPeriod,
  IDENTITY,
  type AnimState,
  type AnimPreset,
} from "./anims/presets"

// --- typed convenience lookups (used by the engine) ------------------------

export const sceneShader = (id?: string): SceneShaderDef | undefined =>
  get("scene-shader", id)
export const elementShader = (id?: string): ElementShaderDef | undefined =>
  get("element-shader", id)
export const pixelEffect = (id?: string): PixelDef | undefined =>
  get("pixel", id)
export const filterEffect = (id?: string): FilterDef | undefined =>
  get("filter", id)
export const animEffect = (id?: string): AnimDef | undefined => get("anim", id)

/** A per-element shader is "live" only when it can animate AND the element's
 *  Animate toggle is on (a static shader paints one frame and idles). */
export function isElementShaderAnimated(
  id?: string,
  animate?: boolean
): boolean {
  return !!animate && !!elementShader(id)?.animated
}

/** Whether an element's anim/filter needs a fresh frame every tick. Generalises
 *  the old `anim !== none || filter === 'hue'` rule: any animated anim or filter. */
export function isElementDynamic(animId?: string, filterId?: string): boolean {
  return !!animEffect(animId)?.animated || !!filterEffect(filterId)?.animated
}
