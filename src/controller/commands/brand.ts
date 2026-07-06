// Brand commands: apply/merge the document's brand snapshot (compiling tokens
// into the scene theme) and instantiate brand catalog components. The agent
// and the UI dispatch the same commands — an inserted component comes out
// styled and overridden to the brand with zero caller effort.

import { z } from "zod"
import type { AnyCommandDef } from "../types"
import type { BrandSnapshot } from "../../brand/types"
import { DEFAULT_MOTION } from "../../brand/types"
import {
  componentIdList,
  get as getComponent,
  instantiate,
} from "../../brand/components"
import { insertNode } from "../../scene/model"
import { normalizeNode, resolveNodeId } from "../normalize"
import { zCssMap, zLayout } from "../schemas"
import { CommandAbort, defineCommand } from "../types"

const zOverride = z.object({
  variants: z.record(z.string(), z.string()).optional(),
  css: z.record(z.string(), z.string()).optional(),
  hidden: z.boolean().optional(),
})

const zMotion = z.object({
  entrance: z.string().optional(),
  pace: z.enum(["calm", "standard", "snappy"]).optional(),
  stagger: z.number().min(0).max(2).optional(),
  ambient: z.enum(["none", "subtle", "lively"]).optional(),
  emphasis: z.string().optional(),
})

export const brandCommands: AnyCommandDef[] = [
  defineCommand({
    id: "brand.apply",
    title: "Apply brand",
    group: "Document",
    description:
      "Set or merge the document's brand (token palette, fonts, voice, asset:-referenced logo, per-component overrides, motion preferences) and compile the tokens into the scene theme. Palette keys are theme tokens (--primary, --accent, --ink, …). Passing a brandId different from the current one replaces the whole snapshot (linking a library brand); otherwise fields merge.",
    schema: z.object({
      brandId: z.string().optional(),
      syncedAt: z.number().optional(),
      palette: z.record(z.string(), z.string()).optional(),
      fontHeading: z.string().optional(),
      fontBody: z.string().optional(),
      voice: z.string().optional(),
      logo: z.string().optional(),
      components: z.record(z.string(), zOverride).optional(),
      motion: zMotion.optional(),
    }),
    invalidates: "style",
    apply: (draft, args) => {
      const prev = draft.document.brand
      // Linking a different library brand replaces the snapshot wholesale —
      // stale overrides from the previous brand must not leak through.
      const replace =
        args.brandId !== undefined && args.brandId !== prev?.brandId
      const base = replace ? undefined : prev

      const tokens: Record<string, string> = { ...base?.tokens }
      for (const [key, value] of Object.entries(args.palette ?? {})) {
        if (key.startsWith("--")) tokens[key] = value
      }
      if (args.fontHeading) tokens["--font-heading"] = args.fontHeading
      if (args.fontBody) tokens["--font-body"] = args.fontBody

      const snap: BrandSnapshot = {
        brandId: args.brandId ?? base?.brandId,
        syncedAt: args.syncedAt ?? base?.syncedAt,
        tokens,
        logo: args.logo ?? base?.logo,
        voice: args.voice ?? base?.voice,
        components: { ...base?.components, ...args.components },
        motion: { ...DEFAULT_MOTION, ...base?.motion, ...args.motion },
      }
      draft.document.brand = snap

      // Compile into theme tokens — one edit re-skins the whole design.
      const themeTokens = draft.document.scene.theme.tokens
      for (const [key, value] of Object.entries(tokens)) {
        themeTokens[key] = value
      }
    },
  }),

  defineCommand({
    id: "component.insert",
    title: "Insert brand component",
    group: "Element",
    description:
      'Instantiate a brand catalog component — it comes out styled to the document\'s brand (tokens + the brand\'s per-component overrides) without hand-written CSS. Read motif_read level:"capabilities" for each component\'s slots and variant axes. `content` fills text slots; `css` is a last-resort patch on the surface. Returns the new element id.',
    schema: z.object({
      component: z.string(),
      parentId: z.string().optional(),
      index: z.number().int().min(0).optional(),
      layout: zLayout.optional(),
      content: z.record(z.string(), z.string()).optional(),
      variants: z.record(z.string(), z.string()).optional(),
      css: zCssMap.optional(),
      image: z.string().optional(),
      select: z.boolean().optional(),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const def = getComponent(args.component)
      if (!def) {
        throw new CommandAbort(
          `unknown component "${args.component}" — one of: ${componentIdList()}`
        )
      }
      const brand = draft.document.brand
      const override = brand?.components[args.component]
      if (override?.hidden) {
        warn(`"${args.component}" is hidden by this brand — inserting anyway`)
      }
      const result = instantiate(args.component, {
        content: args.content,
        variants: args.variants,
        css: args.css,
        layout: args.layout,
        image: args.image,
        logo: brand?.logo,
        override,
      })!
      result.warnings.forEach(warn)

      // The same repair gate agent-authored nodes pass through.
      const node = normalizeNode(result.node, warn)
      const scene = draft.document.scene
      const parentId = args.parentId
        ? resolveNodeId(scene, args.parentId, [], warn)
        : undefined
      insertNode(scene, node, parentId === "root" ? undefined : parentId, args.index)
      if (args.select !== false) draft.selection = [node.id]
      return node.id
    },
  }),
]
