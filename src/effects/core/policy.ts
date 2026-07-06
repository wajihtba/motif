// Per-effect placement policy — the "where may this effect go" contract.
//
// A policy generalises EffectSupports with role-level placement rules and a
// feature flag. It is resolved in three layers, later wins per-field:
//   1. per-kind defaults        (registry.defaultPolicy — derived from supports)
//   2. the def's `policy` block (typed, co-located with the shader code)
//   3. a JSON override file     (src/effects/config/<kind>.<id>.json — plain
//      text, editable without touching shader code)
//
// Roles are plain strings here: effects/core stays dependency-free and must
// not import scene types (precedent: EffectScope is duplicated the same way).
// The normalize gate validates them against the real ElementRole union.

import type { EffectScope } from "./types"

/** Nodes to protect from a full-frame effect (composite crisp above it). */
export interface FxExcludeSpec {
  roles?: string[]
  ids?: string[]
}

export interface EffectPolicy {
  /** Feature flag: false → hidden from pickers/catalog, dropped by the gate. */
  enabled: boolean
  /** Where the effect may be targeted. */
  targets: ("canvas" | "element")[]
  /** Which pixel scopes the effect supports on element targets. */
  scopes: EffectScope[]
  /** When set, element/role targets must resolve within these roles. */
  allowRoles?: string[]
  /** Never applies to nodes with these roles; also unioned into the engine's
   *  protected set when the effect runs full-frame. */
  denyRoles?: string[]
  /** Seeded into layer.exclude for canvas-target layers when the caller gives
   *  none (explicit `{roles:[]}` opts out). */
  defaultExclude?: FxExcludeSpec
  /** Preferred target when the caller gives none. */
  defaultTarget?: "canvas" | "selection"
}

export type EffectPolicyPatch = Partial<EffectPolicy>

/** Layer patches over a base policy; later patches win field-by-field.
 *  Array/object fields replace wholesale — a patch that sets
 *  `defaultExclude: {}` deliberately clears an inherited default. */
export function mergePolicy(
  base: EffectPolicy,
  ...patches: (EffectPolicyPatch | undefined)[]
): EffectPolicy {
  const out: EffectPolicy = { ...base }
  for (const p of patches) {
    if (!p) continue
    if (p.enabled !== undefined) out.enabled = p.enabled
    if (p.targets !== undefined) out.targets = p.targets
    if (p.scopes !== undefined) out.scopes = p.scopes
    if (p.allowRoles !== undefined) out.allowRoles = p.allowRoles
    if (p.denyRoles !== undefined) out.denyRoles = p.denyRoles
    if (p.defaultExclude !== undefined) out.defaultExclude = p.defaultExclude
    if (p.defaultTarget !== undefined) out.defaultTarget = p.defaultTarget
  }
  return out
}

const POLICY_KEYS = new Set([
  "enabled",
  "targets",
  "scopes",
  "allowRoles",
  "denyRoles",
  "defaultExclude",
  "defaultTarget",
])

/** Loose-parse one JSON config override. Unknown keys warn and are ignored;
 *  malformed values are dropped (config must never crash registration). */
export function parsePolicyPatch(
  raw: unknown,
  warn: (msg: string) => void
): EffectPolicyPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warn("config is not an object — ignored")
    return null
  }
  const src = raw as Record<string, unknown>
  const out: EffectPolicyPatch = {}
  for (const key of Object.keys(src)) {
    if (!POLICY_KEYS.has(key)) {
      warn(`unknown policy key "${key}" — ignored`)
      continue
    }
  }
  if (typeof src.enabled === "boolean") out.enabled = src.enabled
  if (isStringArray(src.targets))
    out.targets = src.targets.filter(
      (t): t is "canvas" | "element" => t === "canvas" || t === "element"
    )
  if (isStringArray(src.scopes))
    out.scopes = src.scopes.filter(
      (s): s is EffectScope =>
        s === "box" || s === "content" || s === "text" || s === "image"
    )
  if (isStringArray(src.allowRoles)) out.allowRoles = src.allowRoles
  if (isStringArray(src.denyRoles)) out.denyRoles = src.denyRoles
  if (src.defaultExclude && typeof src.defaultExclude === "object") {
    const ex = src.defaultExclude as Record<string, unknown>
    const spec: FxExcludeSpec = {}
    if (isStringArray(ex.roles)) spec.roles = ex.roles
    if (isStringArray(ex.ids)) spec.ids = ex.ids
    out.defaultExclude = spec
  }
  if (src.defaultTarget === "canvas" || src.defaultTarget === "selection")
    out.defaultTarget = src.defaultTarget
  return out
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
}
