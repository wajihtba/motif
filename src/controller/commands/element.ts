// Element commands — structural authoring + per-node styling. The `id` on
// every command is optional and resolves through the gate: exact → role →
// fuzzy → current selection (docs/plan/03-agent-first.md §6 semantic
// targeting).

import { current } from "immer"
import { z } from "zod"
import type { AnyCommandDef, EditorState } from "../types"
import type { Scene, SceneNode } from "../../scene/types"
import {
  findNode,
  findParent,
  insertNode,
  moveNode,
  removeNode,
  reorderSibling,
  uid,
} from "../../scene/model"
import {
  sanitizeCss,
  sanitizeHtml,
  sanitizeImageSrc,
} from "../../scene/validate"
import { normalizeNode, resolveNodeId } from "../normalize"
import { zCssMap, zLayout, zRole, zSceneNode } from "../schemas"
import { CommandAbort, defineCommand } from "../types"

const scene = (draft: EditorState): Scene => draft.document.scene

const zId = z.string().optional()

function target(
  draft: EditorState,
  id: string | undefined,
  warn: (m: string) => void
): SceneNode {
  const resolved = resolveNodeId(scene(draft), id, draft.selection, warn)
  const n =
    resolved === "root" ? scene(draft).root : findNode(scene(draft), resolved)
  if (!n) throw new CommandAbort(`unknown element "${resolved}"`)
  return n
}

export const elementCommands: AnyCommandDef[] = [
  defineCommand({
    id: "element.create",
    title: "Create element",
    group: "Element",
    description:
      "Create a node under a parent (root if absent). Accepts a full node (children allowed). Returns its id.",
    schema: z.object({
      parentId: zId,
      index: z.number().int().min(0).optional(),
      node: zSceneNode.optional(),
      // Convenience flat fields (agent shorthand for a leaf node):
      role: zRole.optional(),
      html: z.string().optional(),
      image: z.string().optional(),
      layout: zLayout.optional(),
      css: zCssMap.optional(),
      select: z.boolean().optional(),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const raw: Partial<SceneNode> = {
        ...(args.node ?? {}),
        ...(args.role !== undefined && { role: args.role }),
        ...(args.html !== undefined && { html: args.html }),
        ...(args.image !== undefined && { image: args.image }),
        ...(args.layout !== undefined && { layout: args.layout }),
        ...(args.css !== undefined && { css: args.css }),
      }
      const n = normalizeNode(raw, warn)
      if (findNode(scene(draft), n.id) || n.id === "root") {
        warn(`id "${n.id}" already exists — re-seeded`)
        n.id = uid()
      }
      const parentId = args.parentId
        ? resolveNodeId(scene(draft), args.parentId, [], warn)
        : undefined
      insertNode(scene(draft), n, parentId, args.index)
      if (args.select !== false) draft.selection = [n.id]
      return n.id
    },
  }),

  defineCommand({
    id: "element.duplicate",
    title: "Duplicate element",
    group: "Element",
    description:
      "Clone a node (and subtree) next to the original with fresh ids. Returns the new id.",
    schema: z.object({ id: zId }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      if (n.id === "root") throw new CommandAbort("cannot duplicate the root")
      // `n` is an immer draft (a Proxy) — materialize before cloning.
      const clone = reId(structuredClone(current(n)))
      const parent = findParent(scene(draft), n.id) ?? scene(draft).root
      const index = parent.children
        ? parent.children.findIndex((c) => c.id === n.id) + 1
        : undefined
      insertNode(scene(draft), clone, parent.id, index)
      draft.selection = [clone.id]
      return clone.id
    },
  }),

  defineCommand({
    id: "element.delete",
    title: "Delete element",
    group: "Element",
    description: "Remove a node (and its subtree). Defaults to the selection.",
    schema: z.object({
      id: zId,
      ids: z.array(z.string()).optional(),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const raw = args.ids ?? (args.id ? [args.id] : [...draft.selection])
      if (!raw.length) throw new CommandAbort("nothing to delete")
      for (const r of raw) {
        const id = resolveNodeId(scene(draft), r, draft.selection, warn)
        if (id === "root") throw new CommandAbort("cannot delete the root")
        removeNode(scene(draft), id)
      }
      draft.selection = draft.selection.filter(
        (s) => !!findNode(scene(draft), s)
      )
    },
  }),

  defineCommand({
    id: "element.move",
    title: "Move / nest element",
    group: "Element",
    description:
      "Reparent a node under another (cycles are rejected), optionally at an index.",
    schema: z.object({
      id: z.string(),
      parentId: z.string(),
      index: z.number().int().min(0).optional(),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const id = resolveNodeId(scene(draft), args.id, draft.selection, warn)
      const parentId = resolveNodeId(scene(draft), args.parentId, [], warn)
      moveNode(scene(draft), id, parentId, args.index)
    },
  }),

  defineCommand({
    id: "element.reorder",
    title: "Reorder element",
    group: "Element",
    description:
      "Reorder a node among its siblings (z-order): forward/backward/front/back.",
    schema: z.object({
      id: zId,
      direction: z.enum(["forward", "backward", "front", "back"]),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      reorderSibling(scene(draft), n.id, args.direction)
    },
  }),

  defineCommand({
    id: "element.setLayout",
    title: "Set layout",
    group: "Element",
    description:
      "Replace a node's layout (anchor+normalized absolute, flow, or stack).",
    schema: z.object({ id: zId, layout: zLayout }),
    invalidates: "layout",
    apply: (draft, args, { warn }) => {
      target(draft, args.id, warn).layout = args.layout
    },
  }),

  defineCommand({
    id: "element.setHtml",
    title: "Set HTML",
    group: "Element",
    description:
      "Replace a leaf node's inner HTML (sanitized: allowlisted tags, asset:-only img).",
    schema: z.object({ id: zId, html: z.string() }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      const r = sanitizeHtml(args.html)
      r.warnings.forEach(warn)
      n.html = r.value
      delete n.children
    },
  }),

  defineCommand({
    id: "element.setStyle",
    title: "Set CSS properties",
    group: "Element",
    description:
      "Merge CSS declarations onto a node (camelCase keys; empty value clears the key).",
    schema: z.object({ id: zId, css: zCssMap }),
    invalidates: "layout",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      const r = sanitizeCss(args.css)
      r.warnings.forEach(warn)
      for (const [k, v] of Object.entries(r.value)) {
        if (v === "") delete n.css[k]
        else n.css[k] = v
      }
    },
  }),

  defineCommand({
    id: "element.replaceCss",
    title: "Replace element CSS",
    group: "Element",
    description: "Replace a node's entire CSS block (the raw escape hatch).",
    schema: z.object({ id: zId, css: zCssMap }),
    invalidates: "layout",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      const r = sanitizeCss(args.css)
      r.warnings.forEach(warn)
      n.css = r.value
    },
  }),

  defineCommand({
    id: "element.setImage",
    title: "Set image",
    group: "Element",
    description:
      "Set/clear the node photo (object-fit background). asset:/data:/https sources.",
    schema: z.object({
      id: zId,
      image: z.string().nullable(),
      fit: z.enum(["cover", "contain"]).optional(),
    }),
    invalidates: "structure",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      if (args.image == null) {
        delete n.image
      } else {
        const r = sanitizeImageSrc(args.image)
        r.warnings.forEach(warn)
        if (r.value) n.image = r.value
      }
      if (args.fit) n.imageFit = args.fit
    },
  }),

  defineCommand({
    id: "element.setRole",
    title: "Set role",
    group: "Element",
    description: "Set the semantic role (how looks/agents target the node).",
    schema: z.object({ id: zId, role: zRole }),
    invalidates: "stack",
    apply: (draft, args, { warn }) => {
      target(draft, args.id, warn).role = args.role
    },
  }),

  defineCommand({
    id: "element.setHidden",
    title: "Show / hide element",
    group: "Element",
    description: "Toggle a node out of the paint (kept in the tree).",
    schema: z.object({ id: zId, hidden: z.boolean() }),
    invalidates: "layout",
    apply: (draft, args, { warn }) => {
      target(draft, args.id, warn).hidden = args.hidden
    },
  }),

  defineCommand({
    id: "element.setLocked",
    title: "Lock / unlock element",
    group: "Element",
    description: "Lock a node against selection/drag in the UI.",
    schema: z.object({ id: zId, locked: z.boolean() }),
    invalidates: "none",
    apply: (draft, args, { warn }) => {
      target(draft, args.id, warn).locked = args.locked
    },
  }),

  defineCommand({
    id: "element.setAllowOverlap",
    title: "Allow overlap",
    group: "Element",
    description:
      "Mark a node as intentionally overlapping (suppresses layout overlap warnings for it and its subtree).",
    schema: z.object({ id: zId, allow: z.boolean() }),
    invalidates: "none",
    apply: (draft, args, { warn }) => {
      const n = target(draft, args.id, warn)
      if (args.allow) n.allowOverlap = true
      else delete n.allowOverlap
    },
  }),

  defineCommand({
    id: "element.select",
    title: "Select element(s)",
    group: "Element",
    description:
      "Select nodes by id (empty clears). Mirrors agent focus into the UI halo; the selection is the default target for later edits.",
    schema: z.object({
      ids: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    }),
    invalidates: "none",
    apply: (draft, args, { warn }) => {
      const raw =
        args.ids == null ? [] : Array.isArray(args.ids) ? args.ids : [args.ids]
      draft.selection = raw.map((id) =>
        resolveNodeId(scene(draft), id, draft.selection, warn)
      )
    },
  }),
]

/** Fresh ids for a cloned subtree (duplicate). */
function reId(n: SceneNode): SceneNode {
  n.id = uid()
  for (const c of n.children ?? []) reId(c)
  return n
}
