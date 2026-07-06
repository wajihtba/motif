// Effect planning — resolve the scene's ordered effect stack into what the
// compositor executes per frame: per-unit GL chains, per-unit ctx.filter
// strings, full-frame region chains, canvas-wide filters, and the scene-shader
// chain. Runs on stack/structure changes only, never per frame.

import type { EffectLayer, ElementRole, Scene } from "../scene/types"
import type {
  AnyEffectDef,
  ElementShaderDef,
  FilterDef,
  PixelDef,
  SceneShaderDef,
} from "../effects/core/types"
import { get, policyOf } from "../effects/core/registry"
import { findNode, nodesByRole } from "../scene/model"
import "../effects" // side effect: register every catalogue

export interface ResolvedChainLayer {
  def: ElementShaderDef | PixelDef
  layer: EffectLayer
}
export interface ResolvedFilterLayer {
  def: FilterDef
  layer: EffectLayer
}
export interface ResolvedSceneLayer {
  def: SceneShaderDef
  layer: EffectLayer
}

export interface UnitEffects {
  chain: ResolvedChainLayer[]
  filters: ResolvedFilterLayer[]
}

export interface EffectPlan {
  /** Unit id → its effect stack (targeted nodes ARE unit roots by the split rule). */
  perUnit: Map<string, UnitEffects>
  /** element-shader/pixel layers addressed at the whole canvas. */
  canvasChain: ResolvedChainLayer[]
  /** ctx.filter layers over the whole frame. */
  canvasFilters: ResolvedFilterLayer[]
  /** Full-frame scene shaders, in stack order. */
  scene: ResolvedSceneLayer[]
  /** Nodes protected from the full-frame passes: they are isolated paint
   *  units composited crisp ABOVE the canvas chain / scene chain / canvas
   *  filters (union of layer.exclude + effect policy denyRoles). */
  protected: Set<string>
  /** Any time-driven effect → the loop must keep rendering. */
  animated: boolean
}

/** Node ids protected from full-frame effect passes. One union across all
 *  enabled full-frame layers (v1 semantics — no per-layer granularity): a
 *  node excluded from ANY full-frame effect escapes ALL of them and draws
 *  crisp on top. Sources: the layer's own `exclude` (ids + roles) and the
 *  effect's policy `denyRoles`. */
export function protectedIds(scene: Scene): Set<string> {
  const out = new Set<string>()
  const addRole = (role: string) => {
    for (const n of nodesByRole(scene, role as ElementRole)) out.add(n.id)
  }
  for (const layer of scene.effects) {
    if (!layer.enabled) continue
    const fullFrame =
      layer.kind === "scene-shader" || layer.target.type === "canvas"
    if (!fullFrame) continue
    for (const role of layer.exclude?.roles ?? []) addRole(role)
    for (const id of layer.exclude?.ids ?? []) out.add(id)
    const def = defOf(layer)
    for (const role of (def && policyOf(def).denyRoles) ?? []) addRole(role)
  }
  out.delete(scene.root.id) // the root is always the background unit
  for (const id of [...out]) {
    if (!findNode(scene, id)) out.delete(id) // never split on a ghost
  }
  return out
}

function defOf(layer: EffectLayer): AnyEffectDef | undefined {
  switch (layer.kind) {
    case "scene-shader":
      return get("scene-shader", layer.effect)
    case "element-shader":
      return get("element-shader", layer.effect)
    case "pixel":
      return get("pixel", layer.effect)
    case "filter":
      return get("filter", layer.effect)
    default:
      return undefined
  }
}

export function planEffects(scene: Scene): EffectPlan {
  const perUnit = new Map<string, UnitEffects>()
  const canvasChain: ResolvedChainLayer[] = []
  const canvasFilters: ResolvedFilterLayer[] = []
  const scenePasses: ResolvedSceneLayer[] = []
  let animated = false

  const unitFor = (id: string): UnitEffects => {
    let u = perUnit.get(id)
    if (!u) {
      u = { chain: [], filters: [] }
      perUnit.set(id, u)
    }
    return u
  }

  for (const layer of scene.effects) {
    if (!layer.enabled) continue

    if (layer.kind === "scene-shader") {
      const def = get("scene-shader", layer.effect)
      if (!def || !def.frag) continue
      scenePasses.push({ def, layer })
      if (def.animated && layer.animate) animated = true
      continue
    }

    if (layer.kind === "filter") {
      const def = get("filter", layer.effect)
      if (!def) continue
      if (def.animated && layer.animate) animated = true
      if (layer.target.type === "canvas") {
        canvasFilters.push({ def, layer })
      } else {
        for (const id of targetIds(scene, layer)) {
          unitFor(id).filters.push({ def, layer })
        }
      }
      continue
    }

    // element-shader / pixel → GL chain
    const def =
      layer.kind === "pixel"
        ? get("pixel", layer.effect)
        : get("element-shader", layer.effect)
    if (!def || def.id === "none") continue
    if (def.animated && layer.animate) animated = true
    if (layer.target.type === "canvas") {
      canvasChain.push({ def, layer })
    } else {
      for (const id of targetIds(scene, layer)) {
        unitFor(id).chain.push({ def, layer })
      }
    }
  }

  return {
    perUnit,
    canvasChain,
    canvasFilters,
    scene: scenePasses,
    protected: protectedIds(scene),
    animated,
  }
}

function targetIds(_scene: Scene, layer: EffectLayer): string[] {
  // Role targets are resolved to ids at the normalize gate — the document
  // only ever stores canvas or element-id targets.
  return layer.target.type === "elements" ? layer.target.ids : []
}
