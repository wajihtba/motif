// Content commands: looks (one-click stacked aesthetics), the brand kit, and
// per-format variant overrides. All curated data flows through the same gate
// as agent input — looks are just fx layer bundles tagged owner:'look'.

import { z } from "zod"
import type { AnyCommandDef } from "../types"
import type { BrandKit, VariantOverride } from "../../scene/types"
import { FORMATS } from "../../content/formats"
import { LOOKS, lookByName, lookToLayers } from "../../content/looks"
import { normalizeLayer } from "../normalize"
import { zLayout } from "../schemas"
import { CommandAbort, defineCommand } from "../types"

const FORMAT_KEYS = FORMATS.map((f) => f.key)

export const contentCommands: AnyCommandDef[] = [
  defineCommand({
    id: "look.apply",
    title: "Apply look",
    group: "Effects",
    description: `Apply a curated stacked aesthetic (scene shader + role-targeted element effects) in one step. Replaces any previous look; "none" clears it. Looks: ${LOOKS.map((l) => l.name).join(", ")}.`,
    schema: z.object({
      name: z.string(),
    }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      const scene = draft.document.scene
      scene.effects = scene.effects.filter((l) => l.owner !== "look")
      if (args.name === "none") return
      const look = lookByName(args.name)
      if (!look) {
        throw new CommandAbort(
          `unknown look "${args.name}" — one of: ${LOOKS.map((l) => l.name).join(", ")}, none`
        )
      }
      for (const raw of lookToLayers(look)) {
        const layer = normalizeLayer(raw, { type: "canvas" }, warn, scene)
        if (layer) scene.effects.push(layer)
      }
      return look.label
    },
  }),

  defineCommand({
    id: "brand.apply",
    title: "Apply brand kit",
    group: "Document",
    description:
      "Set the brand kit (palette tokens, fonts, voice, asset:-referenced logo) and compile it into the scene theme. Palette keys are theme tokens (--primary, --accent, --ink, …).",
    schema: z.object({
      palette: z.record(z.string(), z.string()).optional(),
      fontHeading: z.string().optional(),
      fontBody: z.string().optional(),
      voice: z.string().optional(),
      logo: z.string().optional(),
    }),
    invalidates: "style",
    apply: (draft, args) => {
      const prev = draft.document.brandKit
      const kit: BrandKit = {
        palette: { ...(prev?.palette ?? {}), ...(args.palette ?? {}) },
        fontHeading: args.fontHeading ?? prev?.fontHeading,
        fontBody: args.fontBody ?? prev?.fontBody,
        voice: args.voice ?? prev?.voice,
        logo: args.logo ?? prev?.logo,
      }
      draft.document.brandKit = kit
      // Compile into theme tokens — one edit re-skins the whole design.
      const tokens = draft.document.scene.theme.tokens
      for (const [key, value] of Object.entries(kit.palette)) {
        if (key.startsWith("--")) tokens[key] = value
      }
      if (kit.fontHeading) tokens["--font-heading"] = kit.fontHeading
      if (kit.fontBody) tokens["--font-body"] = kit.fontBody
    },
  }),

  defineCommand({
    id: "variant.override",
    title: "Override node for a format",
    group: "Formats",
    description:
      "Set a per-format layout/visibility override for a node (content cannot be overridden — variants never fork copy). Use after generating the canonical scene to adapt other formats.",
    schema: z.object({
      format: z.enum(FORMAT_KEYS as [string, ...string[]]),
      id: z.string(),
      layout: zLayout.optional(),
      hidden: z.boolean().optional(),
    }),
    invalidates: "none",
    apply: (draft, args) => {
      if (args.layout === undefined && args.hidden === undefined) {
        throw new CommandAbort("variant.override needs layout and/or hidden")
      }
      let variant = draft.document.formats.find((v) => v.format === args.format)
      if (!variant) {
        variant = { format: args.format, overrides: {} }
        draft.document.formats.push(variant)
      }
      const override: VariantOverride = {
        ...variant.overrides[args.id],
        ...(args.layout && { layout: args.layout }),
        ...(args.hidden !== undefined && { hidden: args.hidden }),
      }
      variant.overrides[args.id] = override
    },
  }),

  defineCommand({
    id: "variant.clear",
    title: "Clear format overrides",
    group: "Formats",
    description:
      "Remove overrides for a format (whole format, or one node when id is given).",
    schema: z.object({
      format: z.enum(FORMAT_KEYS as [string, ...string[]]),
      id: z.string().optional(),
    }),
    invalidates: "none",
    apply: (draft, args) => {
      const i = draft.document.formats.findIndex(
        (v) => v.format === args.format
      )
      if (i === -1) return
      if (args.id) {
        delete draft.document.formats[i].overrides[args.id]
      } else {
        draft.document.formats.splice(i, 1)
      }
    },
  }),
]
