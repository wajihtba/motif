// Shared zod schemas for the document vocabulary. These are the SINGLE source
// of truth for command validation (dispatch), agent tool generation (M2's
// motif_edit input schema is generated from the registry), and scene.apply.
// Deliberately permissive where the normalize gate repairs (unknown fields
// are stripped, not fatal); strict where a mistake would corrupt the document.

import { z } from "zod"
import type { Layout } from "../scene/layout"
import type {
  AnimTrack,
  Brief,
  EffectLayer,
  FxTarget,
  SceneNode,
  Theme,
} from "../scene/types"

export const zAnchor = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
])

const zSize = z.union([
  z.number(),
  z.string().regex(/^\d+(\.\d+)?%$/),
  z.literal("auto"),
])

export const zLayout: z.ZodType<Layout> = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("absolute"),
    anchor: zAnchor,
    dx: z.number(),
    dy: z.number(),
    width: zSize,
    height: zSize,
  }),
  z.object({ mode: z.literal("flow") }),
  z.object({
    mode: z.literal("stack"),
    direction: z.enum(["row", "column"]),
    gap: z.number(),
    align: z.enum(["start", "center", "end", "stretch"]),
    justify: z.enum(["start", "center", "end", "between", "around"]),
    wrap: z.boolean().optional(),
    padding: z.number().optional(),
    anchor: zAnchor.optional(),
    dx: z.number().optional(),
    dy: z.number().optional(),
    width: zSize.optional(),
    height: zSize.optional(),
  }),
]) as z.ZodType<Layout>

export const zRole = z.enum([
  "image",
  "scrim",
  "vignette",
  "grain",
  "eyebrow",
  "headline",
  "subhead",
  "cta",
  "badge",
  "price",
  "meta",
  "group",
])

export const zTarget: z.ZodType<FxTarget> = z.union([
  z.object({ type: z.literal("canvas") }),
  z.object({ type: z.literal("elements"), ids: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("role"), role: zRole }),
])

export const zCssMap = z.record(z.string(), z.string())

export const zSceneNode: z.ZodType<Partial<SceneNode>> = z.lazy(() =>
  z
    .object({
      id: z.string().optional(),
      role: zRole.optional(),
      tag: z.string().optional(),
      html: z.string().optional(),
      children: z.array(zSceneNode).optional(),
      image: z.string().optional(),
      imageFit: z.enum(["cover", "contain"]).optional(),
      layout: zLayout.optional(),
      css: zCssMap.optional(),
      editable: z.boolean().optional(),
      hidden: z.boolean().optional(),
      locked: z.boolean().optional(),
      allowOverlap: z.boolean().optional(),
    })
    .loose()
) as z.ZodType<Partial<SceneNode>>

export const zTheme: z.ZodType<Partial<Theme>> = z.object({
  mode: z.enum(["light", "dark"]).optional(),
  tokens: z.record(z.string(), z.string()).optional(),
})

/** Loose layer/track shapes — registry-aware clamping arrives with the effect
 *  (M3) and animation (M4) registries; the gate keeps document shape valid. */
export const zEffectLayer: z.ZodType<Partial<EffectLayer>> = z
  .object({
    id: z.string().optional(),
    effect: z.string(),
    kind: z
      .enum(["scene-shader", "element-shader", "pixel", "filter"])
      .optional(),
    params: z.record(z.string(), z.number()).optional(),
    animate: z.boolean().optional(),
    enabled: z.boolean().optional(),
    target: zTarget.optional(),
    scope: z.enum(["box", "content", "text", "image"]).optional(),
    frag: z.string().optional(),
    owner: z.string().optional(),
  })
  .loose()

export const zAnimChannel = z.object({
  prop: z.enum(["opacity", "x", "y", "scale", "rotate"]),
  frames: z.array(
    z.object({ t: z.number(), v: z.number(), ease: z.string().optional() })
  ),
})

export const zAnimTrack: z.ZodType<Partial<AnimTrack>> = z
  .object({
    id: z.string().optional(),
    target: zTarget.optional(),
    enabled: z.boolean().optional(),
    preset: z.string().optional(),
    params: z.record(z.string(), z.number()).optional(),
    start: z.number().min(0).optional(),
    duration: z.number().positive().optional(),
    loop: z.boolean().optional(),
    stagger: z.number().min(0).optional(),
    tracks: z.array(zAnimChannel).optional(),
    owner: z.string().optional(),
  })
  .loose()

export const zBrief: z.ZodType<Brief> = z.object({
  goal: z.string().optional(),
  audience: z.string().optional(),
  tone: z.string().optional(),
  mustInclude: z.array(z.string()).optional(),
  notes: z.string().optional(),
})
