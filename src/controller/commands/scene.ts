// Scene & theme commands. `scene.apply` is the agent's declarative entry
// point (motif_generate lands here) — the whole intent in one call, repaired
// by the gate; everything else is the granular vocabulary the UI shares.

import { z } from "zod"
import type { AnyCommandDef } from "../types"
import type { Scene } from "../../scene/types"
import { themeByName } from "../../scene/theme"
import { sanitizeStylesheet } from "../../scene/validate"
import { normalizeScene, normalizeTheme } from "../normalize"
import { zAnimTrack, zEffectLayer, zSceneNode, zTheme } from "../schemas"
import { defineCommand } from "../types"

export const sceneCommands: AnyCommandDef[] = [
  defineCommand({
    id: "scene.apply",
    title: "Apply scene (declarative)",
    group: "Scene",
    description:
      "Replace/patch the whole scene declaratively: { root?, theme?, animations?, effects?, background?, stylesheet?, baseWidth?, baseHeight?, format?, timeline? }. Loose input is normalized; omitted parts are kept.",
    schema: z
      .object({
        root: zSceneNode.optional(),
        theme: z.union([zTheme, z.string()]).optional(),
        effects: z.array(zEffectLayer).optional(),
        animations: z.array(zAnimTrack).optional(),
        background: z.string().optional(),
        stylesheet: z.string().optional(),
        baseWidth: z.number().int().min(64).max(8192).optional(),
        baseHeight: z.number().int().min(64).max(8192).optional(),
        format: z.string().optional(),
        timeline: z
          .object({
            duration: z.number().min(1).max(15).optional(),
            fps: z.number().optional(),
          })
          .optional(),
      })
      .loose(),
    invalidates: "scene",
    apply: (draft, args, { warn }) => {
      draft.document.scene = normalizeScene(
        args as Partial<Scene>,
        draft.document.scene,
        warn
      )
      draft.selection = []
    },
  }),

  defineCommand({
    id: "scene.setBackground",
    title: "Set background",
    group: "Scene",
    description: "Set the canvas backdrop CSS (color / gradient).",
    schema: z.object({ value: z.string() }),
    invalidates: "style",
    apply: (draft, args) => {
      draft.document.scene.background = args.value
    },
  }),

  defineCommand({
    id: "scene.setStylesheet",
    title: "Set stylesheet",
    group: "Scene",
    description:
      "Set the shared scene CSS (classes, @font-face; sanitized — no @import / remote url()).",
    schema: z.object({ css: z.string() }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const r = sanitizeStylesheet(args.css)
      r.warnings.forEach(warn)
      draft.document.scene.stylesheet = r.value
    },
  }),

  defineCommand({
    id: "scene.setTheme",
    title: "Set theme",
    group: "Theme",
    description:
      "Replace/patch the scene design tokens: a preset name and/or { mode?, tokens? } patch.",
    schema: z.object({
      preset: z.string().optional(),
      mode: z.enum(["light", "dark"]).optional(),
      tokens: z.record(z.string(), z.string()).optional(),
    }),
    invalidates: "style",
    apply: (draft, args, { warn }) => {
      const scene = draft.document.scene
      if (args.preset) {
        const preset = themeByName(args.preset)
        if (preset) scene.theme = structuredClone(preset)
        else warn(`unknown theme preset "${args.preset}"`)
      }
      scene.theme = normalizeTheme(
        { mode: args.mode, tokens: args.tokens },
        scene.theme
      )
    },
  }),

  defineCommand({
    id: "theme.setToken",
    title: "Set theme token",
    group: "Theme",
    description:
      "Set one design token (e.g. --primary, --radius, --font-heading).",
    schema: z.object({
      key: z.string().regex(/^--[\w-]+$/, "token keys start with --"),
      value: z.string(),
    }),
    invalidates: "style",
    apply: (draft, args) => {
      draft.document.scene.theme.tokens[args.key] = args.value
    },
  }),

  defineCommand({
    id: "scene.setFormat",
    title: "Set format",
    group: "Scene",
    description:
      "Switch the canvas format / base size. (Format variants with per-format overrides arrive with the format catalog.)",
    schema: z.object({
      format: z.string(),
      width: z.number().int().min(64).max(8192).optional(),
      height: z.number().int().min(64).max(8192).optional(),
    }),
    invalidates: "scene",
    apply: (draft, args) => {
      const scene = draft.document.scene
      scene.format = args.format
      if (args.width) scene.baseWidth = args.width
      if (args.height) scene.baseHeight = args.height
    },
  }),

  defineCommand({
    id: "timeline.set",
    title: "Set timeline",
    group: "Animate",
    description: "Set the motion timeline duration (seconds, ≤15).",
    schema: z.object({ duration: z.number().min(1).max(15) }),
    invalidates: "none",
    apply: (draft, args) => {
      draft.document.scene.timeline.duration = args.duration
    },
  }),
]
