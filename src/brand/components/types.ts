// The brandable component contract — reusable scene elements (CTAs, cards,
// tags, lists…) for image/animation generation. Modeled on the effects
// registry (src/effects/core/types.ts): one self-contained def per component,
// registered by its group file, queried generically by the /brand page, the
// `component.insert` command, and the agent's capability catalogue.
//
// A component is NOT a React component: `build()` returns plain SceneNodes
// whose css references theme tokens (var(--primary), var(--radius), …), so a
// brand token edit restyles every instance live — no rebuild needed.
//
// Adding a component = add one def to its group file. Nothing else changes:
// the /brand tile grid, the insert command, and the agent digest all read the
// registry.

import type { Layout } from "../../scene/layout"
import type { ElementRole, SceneNode } from "../../scene/types"

export type ComponentGroup =
  | "Actions"
  | "Badges & Tags"
  | "Text"
  | "Cards"
  | "Lists"
  | "Data & Price"
  | "Decor & Frames"
  | "Shapes"
  | "Backgrounds"
  | "Overlays & FX"
  | "Logo"

/** One choice on a variant axis. `css` (when present) is patched onto the
 *  named part; options whose effect is structural (markup, bullets) carry no
 *  css and are read by build() from ctx.variants instead. */
export interface VariantOption {
  id: string
  label: string
  css?: Record<string, string>
}

export interface VariantAxis {
  key: string
  label: string
  options: VariantOption[]
  /** Default option id (falls back to options[0]). */
  def?: string
  /** Which named part the option css patches (default: the surface/root). */
  part?: string
}

/** A named text hole the user/agent fills ("Shop now", "$49", …). */
export interface ComponentSlot {
  key: string
  label: string
  /** Sample copy used in previews and as the default content. */
  sample: string
}

export interface ComponentBuildCtx {
  /** Slot key → text, samples merged under caller-provided values. */
  content: Record<string, string>
  /** Resolved axis key → option id (defaults ← brand override ← call). */
  variants: Record<string, string>
  /** Placement of the component root in the scene. */
  layout: Layout
  /** Brand logo asset url, for Logo-group components. */
  logo?: string
  /** Optional photo source for image-bearing components (asset:/https). */
  image?: string
}

export interface ComponentDef {
  /** Unique id ('cta', 'card-product', …) — stored nowhere, used everywhere. */
  id: string
  name: string
  group: ComponentGroup
  /** One line, agent-facing. */
  blurb: string
  /** Roles the built subtree carries (agent/lint targeting). */
  roles: ElementRole[]
  /** Tokens the css references — docs + /brand page affordances. */
  tokensUsed: string[]
  slots: ComponentSlot[]
  variants?: VariantAxis[]
  /** Preview tile canvas size in px (default 500x300). */
  preview?: { w: number; h: number }
  /** Pure builder. The returned root is the component's "surface"; nodes that
   *  variant axes patch by name carry the part name as their `id` (registry
   *  re-ids the whole subtree after patching). */
  build: (ctx: ComponentBuildCtx) => SceneNode
}
