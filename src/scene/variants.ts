// Format variants — ONE canonical scene, sparse per-format overrides
// (docs/plan/01-architecture.md §4). The override type is layout/visibility
// ONLY, so a variant structurally cannot fork content: edit the headline once
// and every format inherits it. Resolution derives a renderable Scene for a
// format without touching the canonical document.

import type { Document, FormatVariant, Scene, SceneNode } from "./types"
import { FORMATS, formatByKey } from "../content/formats"

/** Derive the renderable scene for a format key. The canonical format
 *  returns the scene untouched; others resize the frame and apply the
 *  variant's node overrides. */
export function resolveForFormat(doc: Document, formatKey: string): Scene {
  const scene = doc.scene
  if (formatKey === scene.format) return scene
  const format = formatByKey(formatKey)
  const variant = doc.formats.find((v) => v.format === formatKey)
  return {
    ...scene,
    format: format.key,
    baseWidth: format.w,
    baseHeight: format.h,
    root: variant ? overrideNode(scene.root, variant) : scene.root,
  }
}

function overrideNode(node: SceneNode, variant: FormatVariant): SceneNode {
  const o = variant.overrides[node.id] as
    (typeof variant.overrides)[string] | undefined
  const children = node.children?.map((c) => overrideNode(c, variant))
  if (!o && !children) return node
  return {
    ...node,
    ...(o?.layout && { layout: o.layout }),
    ...(o?.hidden !== undefined && { hidden: o.hidden }),
    ...(children && { children }),
  }
}

/** Every format key, canonical first (drives the switcher + batch export). */
export function formatKeysFor(doc: Document): string[] {
  const canonical = doc.scene.format
  return [
    canonical,
    ...FORMATS.map((f) => f.key).filter((k) => k !== canonical),
  ]
}
