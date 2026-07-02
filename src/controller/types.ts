// The command seam — one command surface, two clients (docs/plan/00-product.md).
// Every mutation of the document is a named, self-describing command with a
// zod schema. The UI's widgets and the agent's motif_edit tool dispatch the
// SAME commands through the SAME gate; at this seam they are indistinguishable.

import type { Document } from "../scene/types"

export type CommandSource = "user" | "agent" | "system"

/** What the engine must do after a command — dispatch classifies each patch
 *  so the renderer re-does the minimum (docs/plan/01-architecture.md §5):
 *    none      no repaint (brief, rename)
 *    style     restyle nodes in place, repaint (no re-measure)
 *    layout    re-measure affected boxes, repaint
 *    stack     effect/anim stacks changed — recompute unit split targets
 *    structure tree shape/content changed — re-measure + unit split
 *    scene     full re-mount (load, format switch, scene.apply)
 */
export type Invalidation =
  "none" | "style" | "layout" | "stack" | "structure" | "scene"

const INVALIDATION_ORDER: Invalidation[] = [
  "none",
  "style",
  "layout",
  "stack",
  "structure",
  "scene",
]

export function maxInvalidation(
  a: Invalidation,
  b: Invalidation
): Invalidation {
  return INVALIDATION_ORDER.indexOf(a) >= INVALIDATION_ORDER.indexOf(b) ? a : b
}

/** The editor state the store owns. Selection lives BESIDE the document so
 *  select-actions produce patches (and undo restores selection) without
 *  polluting the document or the history (selection-only patches are not
 *  pushed as undo steps). */
export interface EditorState {
  document: Document
  selection: string[]
}

/** Thrown by a command to abort the WHOLE batch — unresolvable ids and
 *  unknown commands never partially apply (one tool call = one transaction). */
export class CommandAbort extends Error {}

export interface CommandCtx {
  /** Repair report — surfaced to the UI and returned to the agent as a diff. */
  warn: (msg: string) => void
}

/** Structural view of a zod schema — all dispatch needs. Keeping the seam
 *  structural means the registry type doesn't fight zod's invariance (and
 *  M2's tool generation still receives the real zod object). */
export interface SchemaIssue {
  path: PropertyKey[]
  message: string
}
export type SchemaParseResult<TArgs> =
  | { success: true; data: TArgs }
  | { success: false; error: { issues: SchemaIssue[] } }
export interface SchemaLike<TArgs> {
  safeParse: (data: unknown) => SchemaParseResult<TArgs>
}

export interface CommandDef<TArgs> {
  id: string
  title: string
  group: string
  description: string
  schema: SchemaLike<TArgs>
  invalidates: Invalidation
  /** Mutate the draft state. Throw CommandAbort for unresolvable input.
   *  Return value is surfaced per-command (created ids etc.). */
  apply: (draft: EditorState, args: TArgs, ctx: CommandCtx) => unknown
}

/** Registry-facing erased command type. The single cast below is the only
 *  place the arg type is erased; dispatch re-pairs schema output with apply
 *  input by construction (they came from the same CommandDef<TArgs>). */
export interface AnyCommandDef {
  id: string
  title: string
  group: string
  description: string
  schema: SchemaLike<unknown>
  invalidates: Invalidation
  apply: (draft: EditorState, args: unknown, ctx: CommandCtx) => unknown
}

export function defineCommand<TArgs>(def: CommandDef<TArgs>): AnyCommandDef {
  return def as unknown as AnyCommandDef
}

// --- registry (supports late registration: fx.* lands in M3, anim.* in M4) --

const REGISTRY = new Map<string, AnyCommandDef>()

export function registerCommands(defs: AnyCommandDef[]): void {
  for (const def of defs) REGISTRY.set(def.id, def)
}

export function commandById(id: string): AnyCommandDef | undefined {
  return REGISTRY.get(id)
}

export function allCommands(): AnyCommandDef[] {
  return [...REGISTRY.values()]
}
