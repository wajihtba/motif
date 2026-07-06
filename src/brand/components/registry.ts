// The brand component registry — one source of truth the /brand page, the
// `component.insert` command, and the agent digest all query. Deliberately
// tiny and dependency-light, mirroring src/effects/core/registry.ts.

import type { Layout } from "../../scene/layout"
import type { SceneNode } from "../../scene/types"
import type { ComponentOverride } from "../types"
import type { ComponentDef, VariantAxis } from "./types"
import { uid, walk } from "../../scene/model"
import { sanitizeCss } from "../../scene/validate"

const table = new Map<string, ComponentDef>()

/** Register one def. Last write wins; insertion order preserved (Map). */
export function register(def: ComponentDef): ComponentDef {
  table.set(def.id, def)
  return def
}

export function registerAll(defs: readonly ComponentDef[]): void {
  for (const d of defs) register(d)
}

/** All defs in registration order. */
export function list(): ComponentDef[] {
  return [...table.values()]
}

export function get(id?: string): ComponentDef | undefined {
  return id ? table.get(id) : undefined
}

export interface ComponentGroupBucket {
  group: string
  items: ComponentDef[]
}

/** Defs bucketed by group; group and item order follow first registration. */
export function groups(): ComponentGroupBucket[] {
  const out: ComponentGroupBucket[] = []
  const index = new Map<string, ComponentGroupBucket>()
  for (const def of list()) {
    let g = index.get(def.group)
    if (!g) {
      g = { group: def.group, items: [] }
      index.set(def.group, g)
      out.push(g)
    }
    g.items.push(def)
  }
  return out
}

function axisDefault(axis: VariantAxis): string {
  return axis.def ?? axis.options[0].id
}

/** Resolved default variant selection for a def. */
export function defaultVariants(def: ComponentDef): Record<string, string> {
  const out: Record<string, string> = {}
  for (const axis of def.variants ?? []) out[axis.key] = axisDefault(axis)
  return out
}

export interface InstantiateOpts {
  /** Slot key → text (merged over the def's samples). */
  content?: Record<string, string>
  /** Axis key → option id (call-level, beats the brand override). */
  variants?: Record<string, string>
  /** camelCase css patch on the surface — the last merge layer. */
  css?: Record<string, string>
  layout?: Layout
  logo?: string
  image?: string
  /** The brand's per-component override (variants + css), if any. */
  override?: ComponentOverride
}

export interface InstantiateResult {
  node: SceneNode
  warnings: string[]
}

const DEFAULT_LAYOUT: Layout = {
  mode: "absolute",
  anchor: "center",
  dx: 0,
  dy: 0,
  width: "auto",
  height: "auto",
}

/** Find a named part inside the built subtree (before re-iding). The surface
 *  is the root; other parts are nodes whose id equals the part name. */
function findPart(root: SceneNode, part?: string): SceneNode {
  if (!part || part === "surface") return root
  let found: SceneNode | undefined
  walk(root, (n) => {
    if (n.id === part) {
      found = n
      return false
    }
  })
  return found ?? root
}

function patchCss(
  target: SceneNode,
  patch: Record<string, string>,
  warnings: string[]
): void {
  const { value, warnings: w } = sanitizeCss(patch)
  warnings.push(...w)
  target.css = { ...target.css, ...value }
}

/** Build a component instance: resolve variants (axis defaults ← brand
 *  override ← call), build the subtree, patch variant/override/call css in
 *  that order (every layer through sanitizeCss), then re-id every node so the
 *  instance is insertable. Returns undefined for an unknown component id. */
export function instantiate(
  id: string,
  opts: InstantiateOpts = {}
): InstantiateResult | undefined {
  const def = get(id)
  if (!def) return undefined
  const warnings: string[] = []

  const variants = defaultVariants(def)
  for (const layer of [opts.override?.variants, opts.variants]) {
    if (!layer) continue
    for (const [axisKey, optionId] of Object.entries(layer)) {
      const axis = def.variants?.find((a) => a.key === axisKey)
      if (!axis) {
        warnings.push(`${def.id}: unknown variant axis "${axisKey}"`)
        continue
      }
      if (!axis.options.some((o) => o.id === optionId)) {
        warnings.push(
          `${def.id}: unknown option "${optionId}" for axis "${axisKey}" — one of: ${axis.options.map((o) => o.id).join(", ")}`
        )
        continue
      }
      variants[axisKey] = optionId
    }
  }

  const content: Record<string, string> = {}
  for (const slot of def.slots) content[slot.key] = slot.sample
  for (const [k, v] of Object.entries(opts.content ?? {})) content[k] = v

  const root = def.build({
    content,
    variants,
    layout: opts.layout ?? structuredClone(DEFAULT_LAYOUT),
    logo: opts.logo,
    image: opts.image,
  })

  // Variant option css → named part; brand override + call css → surface.
  for (const axis of def.variants ?? []) {
    const option = axis.options.find((o) => o.id === variants[axis.key])
    if (option?.css) patchCss(findPart(root, axis.part), option.css, warnings)
  }
  if (opts.override?.css) patchCss(root, opts.override.css, warnings)
  if (opts.css) patchCss(root, opts.css, warnings)

  // Fresh ids — part-name ids ("surface", "label") must never enter the scene.
  walk(root, (n) => {
    n.id = uid(n === root ? def.id.replace(/[^a-z0-9]+/gi, "") : "el")
  })

  return { node: root, warnings }
}

/** All component ids, registration order — for the cached system prompt. */
export function componentIdList(): string {
  return list()
    .map((d) => d.id)
    .join(", ")
}

/** One byte-stable catalogue line per def — for motif_read capabilities. */
export function componentCatalogLine(def: ComponentDef): string {
  const slots = def.slots.map((s) => s.key).join("|")
  const variants = (def.variants ?? [])
    .map((a) => `${a.key}(${a.options.map((o) => o.id).join("|")})`)
    .join(",")
  return [
    `${def.id} "${def.name}" [${def.group}]`,
    slots && `slots:${slots}`,
    variants && `variants:${variants}`,
    `— ${def.blurb}`,
  ]
    .filter(Boolean)
    .join(" ")
}
