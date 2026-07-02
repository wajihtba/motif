// Effect-stack commands. Every layer passes the registry-aware gate:
// unknown effects abort, params clamp to declared ranges (with warnings the
// agent sees), targets/scopes coerce to what the effect supports, and custom
// GLSL sandbox-compiles before it can enter the document.

import { z } from "zod"
import type { AnyCommandDef, EditorState } from "../types"
import type { EffectLayer, FxTarget } from "../../scene/types"
import { normalizeLayer } from "../normalize"
import { zTarget } from "../schemas"
import { CommandAbort, defineCommand } from "../types"

const zScope = z.enum(["box", "content", "text", "image"])

function fallbackTarget(draft: EditorState): FxTarget {
  return draft.selection.length
    ? { type: "elements", ids: [...draft.selection] }
    : { type: "canvas" }
}

function layerAt(draft: EditorState, id: string): { i: number; layer: EffectLayer } {
  const i = draft.document.scene.effects.findIndex((l) => l.id === id)
  if (i === -1) throw new CommandAbort(`unknown effect layer "${id}"`)
  return { i, layer: draft.document.scene.effects[i] }
}

export const fxCommands: AnyCommandDef[] = [
  defineCommand({
    id: "fx.add",
    title: "Add effect layer",
    group: "Effects",
    description:
      "Add an effect to a target at a scope. Unknown effect ids are rejected; params are seeded from registry defaults and clamped to range. Target defaults to the current selection (else the canvas). Returns the layer id.",
    schema: z.object({
      effect: z.string(),
      kind: z
        .enum(["scene-shader", "element-shader", "pixel", "filter"])
        .optional(),
      target: zTarget.optional(),
      scope: zScope.optional(),
      animate: z.boolean().optional(),
      params: z.record(z.string(), z.number()).optional(),
      frag: z
        .string()
        .optional()
        .describe('GLSL vec4 fx() body (effect="custom" only)'),
    }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      const layer = normalizeLayer(
        args as Partial<EffectLayer>,
        fallbackTarget(draft),
        warn
      )
      if (!layer) {
        throw new CommandAbort(
          `unknown effect "${args.effect}" — read capabilities via motif_read for the catalog`
        )
      }
      draft.document.scene.effects.push(layer)
      return layer.id
    },
  }),

  defineCommand({
    id: "fx.update",
    title: "Update effect layer",
    group: "Effects",
    description:
      "Patch a layer by id: { params?, target?, scope?, animate?, enabled?, frag? }. Params merge; the result re-passes the gate.",
    schema: z.object({
      id: z.string(),
      patch: z
        .object({
          params: z.record(z.string(), z.number()).optional(),
          target: zTarget.optional(),
          scope: zScope.optional(),
          animate: z.boolean().optional(),
          enabled: z.boolean().optional(),
          frag: z.string().optional(),
        })
        .loose(),
    }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      const { i, layer } = layerAt(draft, args.id)
      const merged: Partial<EffectLayer> = {
        ...layer,
        ...args.patch,
        id: layer.id,
        effect: layer.effect,
        kind: layer.kind,
        params: { ...layer.params, ...(args.patch.params ?? {}) },
      }
      const next = normalizeLayer(merged, fallbackTarget(draft), warn)
      if (next) draft.document.scene.effects[i] = next
    },
  }),

  defineCommand({
    id: "fx.remove",
    title: "Remove effect layer",
    group: "Effects",
    description: "Delete an effect layer by id.",
    schema: z.object({ id: z.string() }),
    invalidates: "stack",
    apply: (draft, args) => {
      const { i } = layerAt(draft, args.id)
      draft.document.scene.effects.splice(i, 1)
    },
  }),

  defineCommand({
    id: "fx.reorder",
    title: "Reorder effect layer",
    group: "Effects",
    description: "Move a layer up or down the stack (stack order = paint order).",
    schema: z.object({
      id: z.string(),
      direction: z.enum(["up", "down"]),
    }),
    invalidates: "stack",
    apply: (draft, args) => {
      const arr = draft.document.scene.effects
      const { i } = layerAt(draft, args.id)
      const j = args.direction === "up" ? i - 1 : i + 1
      if (j < 0 || j >= arr.length) return
      const [layer] = arr.splice(i, 1)
      arr.splice(j, 0, layer)
    },
  }),

  defineCommand({
    id: "fx.clear",
    title: "Clear effects",
    group: "Effects",
    description: "Remove every effect layer.",
    schema: z.object({}),
    invalidates: "stack",
    apply: (draft) => {
      draft.document.scene.effects = []
    },
  }),
]
