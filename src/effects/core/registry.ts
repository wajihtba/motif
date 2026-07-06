// The effect registry: one source of truth that every effect self-registers
// into, and that the engine / UI / agent query generically.
//
// It is deliberately tiny and dependency-free (only core/types). The per-kind
// catalogues (lib/effects/<kind>) import `register` and add their defs; the
// barrel (lib/effects/index.ts) imports those catalogues so registration runs
// once at module load, before anything queries.

import type {
  AnyEffectDef,
  EffectByKind,
  EffectKind,
  EffectParam,
  EffectSupports,
} from "./types"
import { mergePolicy, type EffectPolicy, type EffectPolicyPatch } from "./policy"

const tables = new Map<EffectKind, Map<string, AnyEffectDef>>()
const order = new Map<EffectKind, string[]>()

/** JSON config overrides keyed "<kind>.<id>" (two effects may share an id
 *  across kinds — the two ditherings do). Set once by the barrel's loader. */
let policyOverrides = new Map<string, EffectPolicyPatch>()

export function setPolicyOverrides(
  map: Map<string, EffectPolicyPatch>
): void {
  policyOverrides = map
}

/** Per-kind capability defaults — what each kind of effect can target/scope by
 *  construction. Catalogue defs may override `supports`, but rarely need to.
 *   • region effects (element-shader, pixel) run over any pixel region → all
 *     targets + all scopes;
 *   • filter modifies a draw → any target, box scope only;
 *   • scene-shader is a full-frame post pass → canvas only;
 *   • anim drives the (separate) animation layer. */
function defaultSupports(def: AnyEffectDef): EffectSupports {
  switch (def.kind) {
    case "element-shader":
    case "pixel":
      return {
        targets: ["canvas", "element"],
        scopes: ["box", "content", "text", "image"],
        animatable: def.animated,
      }
    case "filter":
      return {
        targets: ["canvas", "element"],
        scopes: ["box"],
        animatable: def.animated,
      }
    case "anim":
      return {
        targets: ["canvas", "element"],
        scopes: ["box"],
        animatable: true,
      }
    case "scene-shader":
    default:
      return { targets: ["canvas"], scopes: ["box"], animatable: def.animated }
  }
}

/** Per-kind default policy: the supports contract + enabled. */
function defaultPolicy(def: AnyEffectDef): EffectPolicy {
  const s = def.supports ?? defaultSupports(def)
  return { enabled: true, targets: s.targets, scopes: s.scopes }
}

/** The resolved placement policy — the ONE source of truth for where an
 *  effect may go. defaults ← def.policy ← JSON config override. */
export function policyOf(def: AnyEffectDef): EffectPolicy {
  return mergePolicy(
    defaultPolicy(def),
    def.policy,
    policyOverrides.get(`${def.kind}.${def.id}`)
  )
}

/** Resolve an effect's capability (always defined after registration).
 *  Delegates to policyOf so policy overrides flow to legacy callers. */
export function supportsOf(def: AnyEffectDef): EffectSupports {
  const p = policyOf(def)
  const s = def.supports ?? defaultSupports(def)
  return { targets: p.targets, scopes: p.scopes, animatable: s.animatable }
}

function table(kind: EffectKind): Map<string, AnyEffectDef> {
  let t = tables.get(kind)
  if (!t) {
    t = new Map()
    tables.set(kind, t)
    order.set(kind, [])
  }
  return t
}

/** Register a single effect def. Last write wins; insertion order preserved.
 *  Fills the `supports` capability with the per-kind default when omitted. */
export function register<TDef extends AnyEffectDef>(def: TDef): TDef {
  if (!def.supports) def.supports = defaultSupports(def)
  const t = table(def.kind)
  if (!t.has(def.id)) order.get(def.kind)!.push(def.id)
  t.set(def.id, def)
  return def
}

/** Register a catalogue of defs (the common case for a group file). */
export function registerAll(defs: readonly AnyEffectDef[]): void {
  for (const d of defs) register(d)
}

/** All defs of a kind, in registration order. */
export function list<TKind extends EffectKind>(
  kind: TKind
): EffectByKind[TKind][] {
  const ids = order.get(kind)
  const t = tables.get(kind)
  if (!ids || !t) return []
  return ids.map((id) => t.get(id) as EffectByKind[TKind])
}

/** One def by kind + id (undefined for unknown / missing id). */
export function get<TKind extends EffectKind>(
  kind: TKind,
  id?: string
): EffectByKind[TKind] | undefined {
  if (!id) return undefined
  return tables.get(kind)?.get(id) as EffectByKind[TKind] | undefined
}

export function has(kind: EffectKind, id: string): boolean {
  return !!tables.get(kind)?.has(id)
}

export const EFFECT_KINDS: EffectKind[] = [
  "scene-shader",
  "element-shader",
  "pixel",
  "filter",
  "anim",
]

/** Resolve an effect by id, optionally constrained to a kind. Used by the
 *  normalize gate to recover the kind from a loose `{ effect }` reference. */
export function findEffect(
  id: string,
  kind?: EffectKind
): { def: AnyEffectDef; kind: EffectKind } | undefined {
  if (kind) {
    const def = get(kind, id)
    return def ? { def, kind } : undefined
  }
  for (const k of EFFECT_KINDS) {
    const def = tables.get(k)?.get(id)
    if (def) return { def, kind: k }
  }
  return undefined
}

export interface EffectGroup<TDef> {
  group: string
  items: TDef[]
}

/** Defs of a kind bucketed by `group`, excluding the "none" sentinel. Group and
 *  item order follow first registration — drives the grouped UI rails. */
export function groups<TKind extends EffectKind>(
  kind: TKind
): EffectGroup<EffectByKind[TKind]>[] {
  const out: EffectGroup<EffectByKind[TKind]>[] = []
  const index = new Map<string, EffectGroup<EffectByKind[TKind]>>()
  for (const def of list(kind)) {
    if (def.id === "none") continue
    if (!policyOf(def).enabled) continue
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

/** Every registered effect across all kinds, in registration order, excluding the
 *  per-kind "none" sentinels — the source for the "add effect" picker and the
 *  agent's capability catalogue. */
export function allEffects(kinds: readonly EffectKind[]): AnyEffectDef[] {
  const out: AnyEffectDef[] = []
  for (const k of kinds)
    for (const d of list(k))
      if (d.id !== "none" && policyOf(d).enabled) out.push(d)
  return out
}

/** Param defaults as a { key: value } record (seeds scene state / reset). */
export function paramDefaults(def: {
  params: EffectParam[]
}): Record<string, number> {
  const o: Record<string, number> = {}
  for (const p of def.params) o[p.key] = p.def
  return o
}

/** Ordered param values for a GLSL `u_p[]` uniform array, filling defaults. */
export function packParams(
  def: { params: EffectParam[] },
  params?: Record<string, number>
): number[] {
  return def.params.map((p) => params?.[p.key] ?? p.def)
}

/**
 * JSON-schema description of an effect's params — the bridge to agent tool-calls.
 * The same metadata that renders the inspector sliders describes the arguments
 * Claude can pass when it invokes this effect. (Consumed by lib/core later.)
 */
export function toolSchema(def: AnyEffectDef): {
  id: string
  kind: EffectKind
  name: string
  group: string
  description?: string
  supports: EffectSupports
  policy: EffectPolicy
  params: Record<
    string,
    {
      type: "number"
      minimum: number
      maximum: number
      default: number
      description: string
    }
  >
} {
  const params: Record<
    string,
    {
      type: "number"
      minimum: number
      maximum: number
      default: number
      description: string
    }
  > = {}
  for (const p of def.params) {
    params[p.key] = {
      type: "number",
      minimum: p.min,
      maximum: p.max,
      default: p.def,
      description:
        p.type === "color"
          ? `${p.label} — packed RGB int (0xRRGGBB, e.g. 16711680 = red)`
          : p.label,
    }
  }
  return {
    id: def.id,
    kind: def.kind,
    name: def.name,
    group: def.group,
    description: def.blurb,
    supports: supportsOf(def),
    policy: policyOf(def),
    params,
  }
}
