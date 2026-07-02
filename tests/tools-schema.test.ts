// The agent tool surface is GENERATED from the command registry — this pins
// the contract: exactly four tools, valid JSON schemas, byte-stable output
// (prompt-cache discipline), and every registered command present in
// motif_edit's union.

import { describe, expect, it } from "vitest"
import { agentTools } from "@/agent/tools"
import { registerCoreCommands } from "@/controller/commands"
import { allCommands } from "@/controller/types"

describe("agent tool schemas", () => {
  it("exposes exactly the four tools", () => {
    expect(agentTools().map((t) => t.name)).toEqual([
      "motif_generate",
      "motif_edit",
      "motif_read",
      "motif_export",
    ])
  })

  it("motif_generate streams eagerly; others do not", () => {
    const tools = agentTools()
    expect(tools[0].eager_input_streaming).toBe(true)
    expect(tools[1].eager_input_streaming).toBeUndefined()
  })

  it("motif_edit covers every registered command", () => {
    registerCoreCommands()
    const schema = agentTools()[1].input_schema as {
      properties: {
        commands: {
          items: {
            anyOf: Array<{ properties: { command: { const: string } } }>
          }
        }
      }
    }
    const covered = schema.properties.commands.items.anyOf.map(
      (v) => v.properties.command.const
    )
    for (const def of allCommands()) {
      expect(covered).toContain(def.id)
    }
  })

  it("is byte-stable across calls (prompt-cache discipline)", () => {
    const a = JSON.stringify(agentTools())
    const b = JSON.stringify(agentTools())
    expect(a).toBe(b)
    expect(a).not.toContain("$schema")
  })

  it("schemas are serializable and reasonably sized", () => {
    const json = JSON.stringify(agentTools())
    expect(json.length).toBeLessThan(120_000)
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
