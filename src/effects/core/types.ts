// The unified effect contract.
//
// Motif has five kinds of visual effect that used to live in five different
// shapes (some with params in arrays, some with behaviour in switch statements,
// some not registered at all). They are now ONE thing: an `EffectDef` that
// co-locates an effect's identity, its grouping, its tunable params, AND its
// payload (GLSL / pixel fn / css / canvas-transform) in a single place.
//
// Two consumers read these defs:
//   1. The engine  — runs the payload (lib/engine).
//   2. The UI      — auto-generates the inspector controls from `params`.
//   3. (later) the agent — the SAME `params` become Claude tool-call schemas via
//      toolSchema(), so adding an effect makes it available to the AI for free.
//
// Adding an effect = add one self-contained def to its group file.
// Removing one     = delete the def. Nothing else references it by hand.

import type { EffectPolicyPatch } from "./policy"

export type EffectKind =
  "scene-shader" | "element-shader" | "pixel" | "filter" | "anim"

export type ParamType = "range" | "toggle" | "color"

/** Where, within a targeted element, an effect's pixels come from. 'box' = the
 *  whole bounding rect; 'content' = the element's own alpha silhouette; 'text' =
 *  only the text/markup layer; 'image' = only the <img> layer. (Canvas-target
 *  effects ignore scope — they run over the full frame.) */
export type EffectScope = "box" | "content" | "text" | "image"

/** The declarative capability contract the agent reads to know where an effect
 *  may apply. 'element' covers single/multi elements AND role groups. Filled with
 *  per-kind defaults at registration, so catalogue files rarely set it. */
export interface EffectSupports {
  targets: ("canvas" | "element")[]
  scopes: EffectScope[]
  animatable: boolean
}

/** One tunable knob. Numeric so it maps cleanly to a GLSL uniform, a slider, and
 *  a JSON-schema `number` for agent tool-calls. Colors are packed 0xRRGGBB
 *  integers (exact in f32) decoded in GLSL via the shared up_rgb() helper. */
export interface EffectParam {
  key: string
  label: string
  /** 'range' → slider; 'toggle' → switch (0/1); 'color' → color picker
   *  (value is a packed 0xRRGGBB integer). Defaults to 'range'. */
  type?: ParamType
  min: number
  max: number
  step: number
  /** Default value, also used to seed scene state and reset. */
  def: number
}

interface EffectBase {
  /** Unique id within the kind (stored in the scene, used by the agent). */
  id: string
  /** Human label for the UI. */
  name: string
  /** Category for UI grouping and agent discovery, e.g. "Retro", "Marketing". */
  group: string
  /** Short description (tooltip / agent hint). */
  blurb?: string
  /** Whether the effect reads time and must keep redrawing while active. */
  animated: boolean
  /** Tunable params (may be empty). */
  params: EffectParam[]
  /** Capability contract for the agent/UI. Defaulted per-kind at registration
   *  (see registry.register), so most defs omit it. */
  supports?: EffectSupports
  /** Placement policy overrides (feature flag, role allow/deny, default
   *  exclusions). Merged over per-kind defaults and under the JSON config
   *  overrides — see core/policy.ts and registry.policyOf. */
  policy?: EffectPolicyPatch
}

/** Full-scene WebGL shader over the whole composite (lib/effects/scene-shaders). */
export interface SceneShaderDef extends EffectBase {
  kind: "scene-shader"
  /** Follows the cursor — redraw only while the pointer moves. */
  pointer: boolean
  /** GLSL: a complete `void main()` body (uses the shared scene prelude). */
  frag: string
}

/** Per-element WebGL shader, baked back into the canvas (element-shaders). */
export interface ElementShaderDef extends EffectBase {
  kind: "element-shader"
  /** Default state of the per-element Animate toggle. */
  animateByDefault: boolean
  /** Whether "Mask to content" applies (clip to glyph/PNG/shape alpha). */
  maskable: boolean
  /** GLSL: a `vec4 fx()` returning straight-alpha colour (uses the element prelude). */
  frag: string
}

/** v2: pixel effects are GPU-resident — a GLSL `vec4 fx()` body run through
 *  the same element stage (zero getImageData in the frame path). Ids and
 *  params match v1's CPU versions so existing scenes stay compatible. */
export interface PixelDef extends EffectBase {
  kind: "pixel"
  frag: string
}

/** ctx.filter visual filter applied around an element's draw (filter). */
export interface FilterDef extends EffectBase {
  kind: "filter"
  css: (t: number, p: Record<string, number>) => string
}

/** Canvas-transform animation applied around an element's draw (anim). */
export interface AnimDef extends EffectBase {
  kind: "anim"
  apply: (
    ctx: CanvasRenderingContext2D,
    t: number,
    w: number,
    h: number,
    p: Record<string, number>
  ) => void
}

export type AnyEffectDef =
  SceneShaderDef | ElementShaderDef | PixelDef | FilterDef | AnimDef

/** Map a kind string to its concrete def type. */
export interface EffectByKind {
  "scene-shader": SceneShaderDef
  "element-shader": ElementShaderDef
  pixel: PixelDef
  filter: FilterDef
  anim: AnimDef
}
