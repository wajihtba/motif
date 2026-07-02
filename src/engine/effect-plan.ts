// Effect planning — resolve the scene's ordered effect stack into what the
// compositor executes per frame: per-unit GL chains, per-unit ctx.filter
// strings, full-frame region chains, canvas-wide filters, and the scene-shader
// chain. Runs on stack/structure changes only, never per frame.

import type { EffectLayer, Scene } from '../scene/types'
import type { ElementShaderDef, FilterDef, PixelDef, SceneShaderDef } from '../effects/core/types'
import { get } from '../effects/core/registry'
import { nodesByRole } from '../scene/model'
import '../effects' // side effect: register every catalogue

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
  /** Any time-driven effect → the loop must keep rendering. */
  animated: boolean
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

    if (layer.kind === 'scene-shader') {
      const def = get('scene-shader', layer.effect)
      if (!def || !def.frag) continue
      scenePasses.push({ def, layer })
      if (def.animated && layer.animate) animated = true
      continue
    }

    if (layer.kind === 'filter') {
      const def = get('filter', layer.effect)
      if (!def) continue
      if (def.animated && layer.animate) animated = true
      if (layer.target.type === 'canvas') {
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
      layer.kind === 'pixel'
        ? get('pixel', layer.effect)
        : get('element-shader', layer.effect)
    if (!def || def.id === 'none') continue
    if (def.animated && layer.animate) animated = true
    if (layer.target.type === 'canvas') {
      canvasChain.push({ def, layer })
    } else {
      for (const id of targetIds(scene, layer)) {
        unitFor(id).chain.push({ def, layer })
      }
    }
  }

  return { perUnit, canvasChain, canvasFilters, scene: scenePasses, animated }
}

function targetIds(scene: Scene, layer: EffectLayer): string[] {
  if (layer.target.type === 'elements') return layer.target.ids
  if (layer.target.type === 'role') {
    return nodesByRole(scene, layer.target.role).map((n) => n.id)
  }
  return []
}
