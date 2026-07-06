// The document model — pure serializable data, the single source of truth that
// BOTH the human UI and the agent read & write (through the same controller).
//
// Shape (decision record: docs/plan/01-architecture.md §4):
//
//   Project → Document → Scene (+ sparse per-format variants)
//
// A Scene is a declarative tree of real HTML/CSS nodes (the "web layer" the LLM
// authors natively) plus two structured, engine-evaluated layers that HTML/CSS
// cannot express inside HTML-in-Canvas:
//
//   • animations[] — engine-driven motion (CSS animation does NOT paint inside
//     HTML-in-Canvas, so motion is sampled per frame by the renderer). v2 tracks
//     are seconds-based against the document timeline.
//   • effects[]    — the registry-backed canvas-only stack (WebGL/pixel/filter),
//     any effect on any target at any scope.
//
// Theme is a shadcn-style design-token set applied as CSS custom properties, so
// node `css` can reference var(--primary) etc. Everything is plain JSON: an
// agent can emit a whole scene and the editor serialises / restores it.

import type { Layout } from "./layout"

// --- effects vocabulary (data side; the registry in src/effects consumes it) --

/** How an effect is evaluated by the engine. */
export type EffectKind = "scene-shader" | "element-shader" | "pixel" | "filter"

/** What part of the target the effect is clipped to. */
export type EffectScope = "box" | "content" | "text" | "image"

// --- targeting ----------------------------------------------------------------

/** Semantic role of a node, so looks / agents can target it (the headline, the
 *  CTA, the sale badge…) without guessing from CSS. 'group' = a layout container. */
export type ElementRole =
  | "image"
  | "scrim"
  | "vignette"
  | "grain"
  | "eyebrow"
  | "headline"
  | "subhead"
  | "cta"
  | "badge"
  | "price"
  | "meta"
  | "group"

/** Where an effect or animation applies. Resolution-independent and stable:
 *  by id(s) or by semantic role, never by index/DOM position. */
export type FxTarget =
  | { type: "canvas" }
  | { type: "elements"; ids: string[] }
  | { type: "role"; role: ElementRole }

// --- the tree -------------------------------------------------------------------

/** One node of the document tree — a real DOM subtree painted into the canvas. */
export interface SceneNode {
  id: string
  role?: ElementRole
  /** HTML tag for the box (default 'div'). */
  tag?: string
  /** Inner HTML for a leaf node (text / inline markup). Ignored if `children`. */
  html?: string
  /** Nested children → a real tree. A node is a leaf when this is empty/absent. */
  children?: SceneNode[]
  /** Photo painted as an object-fit background of the box. `asset:<id>` URLs
   *  resolve from the project asset store; remote URLs must be CORS-clean. */
  image?: string
  imageFit?: "cover" | "contain"
  /** Resolution-independent placement (compiles to CSS). */
  layout: Layout
  /** Unrestricted CSS declarations (camelCase keys); may use var(--token). */
  css: Record<string, string>
  /** contenteditable so text can be edited in place. */
  editable?: boolean
  /** Hidden from paint (UI toggle); kept in the tree. */
  hidden?: boolean
  /** Locked from selection/drag in the UI. */
  locked?: boolean
  /** Intentional layering — opts this node (and its subtree) out of the
   *  overlap lint. Scrims/badges over images never need it; set it only for
   *  deliberate content-on-content overlap (type lockups etc.). */
  allowOverlap?: boolean
}

/** shadcn-style design tokens, applied as CSS custom properties on the scene root. */
export interface Theme {
  mode: "light" | "dark"
  /** e.g. { '--primary': 'oklch(…)', '--radius': '0.7rem', '--font-heading': "'Playfair'" } */
  tokens: Record<string, string>
}

// --- effects & animation layers ------------------------------------------------

/** One canvas-only effect, applied to a target at a scope. Stackable + ordered. */
export interface EffectLayer {
  id: string
  /** Registry effect id ('metal', 'chroma', 'dither', 'custom', …). */
  effect: string
  /** Resolved registry kind, for the renderer to dispatch. */
  kind: EffectKind
  params: Record<string, number>
  /** Time-driven when the effect is animatable. */
  animate: boolean
  enabled: boolean
  target: FxTarget
  scope: EffectScope
  /** Custom GLSL `fx()` body — the code escape hatch when `effect === 'custom'`. */
  frag?: string
  /** Tag for look-owned layers so `look.apply` can replace its predecessor's. */
  owner?: string
}

export type AnimProp = "opacity" | "x" | "y" | "scale" | "rotate"

export interface AnimChannel {
  prop: AnimProp
  /** Keyframes with `t` normalized 0..1 within the track's [start, start+duration] window. */
  frames: Array<{ t: number; v: number; ease?: string }>
}

/** One engine-driven animation, targeting like an effect. Either a registry
 *  `preset` (+params) or an explicit keyframe `tracks` escape hatch. v2 tracks
 *  are placed in SECONDS on the document timeline (deterministic: the animator
 *  samples `sampleAt(t)` — same t, same pixels). */
export interface AnimTrack {
  id: string
  target: FxTarget
  enabled: boolean
  /** Registry anim preset id ('fadeIn','slideIn','float','pulse','spin',…). */
  preset?: string
  params?: Record<string, number>
  /** Window start on the timeline, seconds (default 0). */
  start?: number
  /** Window length, seconds (default: the preset's natural length). */
  duration?: number
  /** Loop within the window for ambient motion. */
  loop?: boolean
  /** Per-target stagger in seconds when the target resolves to multiple nodes. */
  stagger?: number
  /** Explicit keyframes (escape hatch). Presets compile to this shape. */
  tracks?: AnimChannel[]
  owner?: string
}

// --- scene -----------------------------------------------------------------------

/** The motion timeline for the scene's animated variant. One scene, one
 *  duration — multi-scene sequencing is deliberately out of scope. */
export interface Timeline {
  /** Seconds; the mp4/WebM export length. */
  duration: number
  /** Fixed at 30 for deterministic export frame-stepping. */
  fps: number
}

export interface Scene {
  /** Canonical design size; export formats are scaled viewports of this. */
  baseWidth: number
  baseHeight: number
  format: string
  background: string
  theme: Theme
  /** Shared CSS escape hatch (classes, @font-face — non-animating CSS only). */
  stylesheet?: string
  /** The document tree. The root is a full-canvas container. */
  root: SceneNode
  animations: AnimTrack[]
  effects: EffectLayer[]
  timeline: Timeline
}

// --- per-format variants ----------------------------------------------------------

/** What a format variant may override per node — layout and visibility ONLY.
 *  Content (html/image/css/children) is structurally impossible here, so
 *  variants can never fork the canonical design. */
export interface VariantOverride {
  layout?: Layout
  hidden?: boolean
}

/** Sparse per-format adaptation of the canonical scene. */
export interface FormatVariant {
  /** Format id from src/content/formats.ts ('ig-story', 'og', …). */
  format: string
  /** Node id → override. Absent nodes inherit the canonical layout. */
  overrides: Record<string, VariantOverride>
}

// --- document & project -------------------------------------------------------------

/** Durable creative intent — agent-writable via `brief.update`, injected into
 *  every agent turn, survives chat compaction / reload / a fresh conversation. */
export interface Brief {
  goal?: string
  audience?: string
  tone?: string
  mustInclude?: string[]
  notes?: string
}

export interface Document {
  id: string
  name: string
  brief: Brief
  /** The canonical scene all format variants derive from. */
  scene: Scene
  formats: FormatVariant[]
  /** Brand identity (M6): compiled into theme tokens + the agent context.
   *  Conceptually project-level; it rides the document until M7's project
   *  persistence lifts it. */
  brandKit?: BrandKit
}

/** Brand identity compiled into scene theme tokens + the agent system prompt. */
export interface BrandKit {
  /** `asset:<id>` reference into the project asset store. */
  logo?: string
  /** OKLCH palette by token role ('--primary', '--accent', …). */
  palette: Record<string, string>
  fontHeading?: string
  fontBody?: string
  /** Tone-of-voice guidance injected into the agent prompt. */
  voice?: string
}

export interface Project {
  id: string
  name: string
  brandKit?: BrandKit
  documents: Document[]
  createdAt: number
  updatedAt: number
}
