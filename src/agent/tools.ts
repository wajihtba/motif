// The agent's tool surface — exactly FOUR tools (docs/plan/03-agent-first.md):
//
//   motif_generate  emit a full/partial declarative Scene (eager input
//                   streaming → the canvas fills progressively)
//   motif_edit      a typed batch of controller commands — ONE call = ONE
//                   transaction = ONE undo step
//   motif_read      the world model on demand (summary/tree/node/capabilities)
//   motif_export    render the canvas out (PNG now; video with M5)
//
// motif_edit's input schema is GENERATED from the command registry's zod
// schemas — the same source dispatch validates against, so agent tool calls
// get API-side validation and the tool list stays byte-stable for prompt
// caching (deterministic registry order). This module is isomorphic: the
// server (request assembly) and the client (execution) import the same file.

import { z } from "zod"
import { registerCoreCommands } from "../controller/commands"
import { allCommands } from "../controller/types"

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
  eager_input_streaming?: boolean
}

/** zod → JSON schema, stripped of the $schema banner for byte-stability. */
function jsonSchema(schema: unknown): Record<string, unknown> {
  const out = z.toJSONSchema(schema as z.ZodType, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }) as Record<string, unknown>
  delete out.$schema
  return out
}

let cached: ToolDefinition[] | null = null

export function agentTools(): ToolDefinition[] {
  if (cached) return cached
  registerCoreCommands()
  const commands = allCommands()

  const generate = commands.find((c) => c.id === "scene.apply")
  if (!generate) throw new Error("scene.apply must be registered")

  const commandVariants = commands.map((def) => ({
    type: "object",
    description: `${def.title}: ${def.description}`,
    properties: {
      command: { const: def.id },
      args: jsonSchema(def.schema),
    },
    required: ["command", "args"],
    additionalProperties: false,
  }))

  cached = [
    {
      name: "motif_generate",
      description:
        "Create or replace the design as one declarative scene. Emit background and large containers FIRST, then content nodes in visual stacking order — the canvas paints progressively while you stream. Prefer semantic roles on every node, theme var(--tokens) in css, and normalized anchor layout. Lay content chains out as column stacks; the result reports layout warnings (overlap/overflow) you must resolve. Omitted fields keep their current values.",
      input_schema: jsonSchema(generate.schema),
      eager_input_streaming: true,
    },
    {
      name: "motif_edit",
      description:
        "Apply a batch of edit commands as ONE atomic transaction (one undo step for the user). Use for every change to an existing design. If any command fails the whole batch is rejected and nothing applies — fix and retry. The result reports what changed, repair warnings, and any edits the user made since your last turn.",
      input_schema: {
        type: "object",
        properties: {
          commands: {
            type: "array",
            minItems: 1,
            items: { anyOf: commandVariants },
          },
        },
        required: ["commands"],
        additionalProperties: false,
      },
    },
    {
      name: "motif_read",
      description:
        "Read the current world model. level=summary (counts, brief, selection), tree (one line per node with boxes), node (full detail for one id), capabilities (commands, roles, theme tokens).",
      input_schema: {
        type: "object",
        properties: {
          level: {
            type: "string",
            enum: ["summary", "tree", "node", "capabilities"],
          },
          id: {
            type: "string",
            description: "Node id (level=node only; defaults to selection)",
          },
        },
        required: ["level"],
        additionalProperties: false,
      },
    },
    {
      name: "motif_export",
      description:
        "Export the current canvas as an image download for the user. Ask before exporting unless the user requested it. Set review:true to get the rendered image back YOURSELF (downscaled, no user download) for a visual check — composition, contrast, crops.",
      input_schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["png", "jpeg"] },
          review: {
            type: "boolean",
            description:
              "Return the rendered image to you for self-review (no user download)",
          },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  ]
  return cached
}
