// Animation-track commands. Tracks live in SECONDS on the document timeline;
// presets come from the anim catalog (unknown presets abort, params clamp),
// with the keyframe `tracks` escape hatch for bespoke motion.

import { z } from "zod"
import type { AnyCommandDef, EditorState } from "../types"
import type { AnimTrack, AnimTrackInput, FxTarget } from "../../scene/types"
import { normalizeTrack } from "../normalize"
import { zAnimChannel, zTarget } from "../schemas"
import { CommandAbort, defineCommand } from "../types"

function fallbackTarget(draft: EditorState): FxTarget {
  return draft.selection.length
    ? { type: "elements", ids: [...draft.selection] }
    : { type: "canvas" }
}

function trackAt(
  draft: EditorState,
  id: string
): { i: number; track: AnimTrack } {
  const i = draft.document.scene.animations.findIndex((t) => t.id === id)
  if (i === -1) throw new CommandAbort(`unknown animation track "${id}"`)
  return { i, track: draft.document.scene.animations[i] }
}

const zTrackFields = {
  target: zTarget.optional(),
  params: z.record(z.string(), z.number()).optional(),
  start: z.number().min(0).optional(),
  duration: z.number().positive().optional(),
  loop: z.boolean().optional(),
  stagger: z.number().min(0).optional(),
  tracks: z.array(zAnimChannel).optional(),
}

export const animCommands: AnyCommandDef[] = [
  defineCommand({
    id: "anim.add",
    title: "Add animation",
    group: "Animate",
    description:
      "Add an engine-driven motion track: a preset (fadeIn, riseIn, slideIn, popIn, float, pulse, spin, sway, heartbeat) or keyframe `tracks`. start/duration/stagger are SECONDS on the timeline; target defaults to the selection. Returns the track id.",
    schema: z.object({
      preset: z.string().optional(),
      ...zTrackFields,
    }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      const track = normalizeTrack(
        args,
        fallbackTarget(draft),
        warn,
        draft.document.scene
      )
      if (!track) {
        throw new CommandAbort(
          `unknown animation preset "${args.preset ?? ""}" and no keyframes given`
        )
      }
      if (track.target.type === "canvas") {
        throw new CommandAbort(
          "animations need an element target (select something or pass ids/role)"
        )
      }
      draft.document.scene.animations.push(track)
      return track.id
    },
  }),

  defineCommand({
    id: "anim.update",
    title: "Update animation",
    group: "Animate",
    description:
      "Patch a track by id: { params?, target?, start?, duration?, loop?, stagger?, enabled? }. Params merge; the result re-passes the gate.",
    schema: z.object({
      id: z.string(),
      patch: z
        .object({ ...zTrackFields, enabled: z.boolean().optional() })
        .loose(),
    }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      const { i, track } = trackAt(draft, args.id)
      const merged: AnimTrackInput = {
        ...track,
        ...args.patch,
        id: track.id,
        preset: track.preset,
        params: { ...track.params, ...(args.patch.params ?? {}) },
      }
      const next = normalizeTrack(
        merged,
        fallbackTarget(draft),
        warn,
        draft.document.scene
      )
      if (next) draft.document.scene.animations[i] = next
    },
  }),

  defineCommand({
    id: "anim.remove",
    title: "Remove animation",
    group: "Animate",
    description: "Delete an animation track by id.",
    schema: z.object({ id: z.string() }),
    invalidates: "stack",
    apply: (draft, args) => {
      const { i } = trackAt(draft, args.id)
      draft.document.scene.animations.splice(i, 1)
    },
  }),

  defineCommand({
    id: "anim.clear",
    title: "Clear animations",
    group: "Animate",
    description: "Remove every animation track.",
    schema: z.object({}),
    invalidates: "stack",
    apply: (draft) => {
      draft.document.scene.animations = []
    },
  }),
]
