// Recorded-stream replay (eval lane 2, M2 verify): the mock agent scripts
// drive the FULL client loop against a real controller — progressive
// generation, one-undo-step transactionality, diff tool results, and
// error round-trips — with no model and no network.

import { describe, expect, it } from "vitest"
import type { AgentTransport, SseEvent } from "@/agent/loop"
import { EditorController } from "@/controller"
import { AgentSession, httpTransport } from "@/agent/loop"
import { ChatStore } from "@/agent/chat"
import { mockEvents } from "@/agent/mock-stream"

void httpTransport // exercised in the browser; tests inject transports

function toSse(events: Array<Record<string, unknown>>): SseEvent[] {
  return events.map((e) => ({ event: e.type as string, data: e }))
}

async function* iter(events: SseEvent[]): AsyncIterable<SseEvent> {
  for (const e of events) {
    await Promise.resolve()
    yield e
  }
}

/** Transport that replays scripted rounds in order. */
function scriptedTransport(rounds: SseEvent[][]): AgentTransport {
  let i = 0
  return (_body, _signal) => {
    const round = rounds[Math.min(i, rounds.length - 1)]
    i += 1
    return Promise.resolve(iter(round))
  }
}

function toolUseRound(
  name: string,
  input: unknown,
  opts: { text?: string } = {}
): SseEvent[] {
  const json = JSON.stringify(input)
  const chunks: string[] = []
  for (let i = 0; i < json.length; i += 32) chunks.push(json.slice(i, i + 32))
  const events: Array<Record<string, unknown>> = [
    { type: "message_start", message: { usage: {} } },
  ]
  let index = 0
  if (opts.text) {
    events.push(
      {
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: opts.text },
      },
      { type: "content_block_stop", index }
    )
    index += 1
  }
  events.push(
    {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id: `toolu_${name}`, name, input: {} },
    },
    ...chunks.map((partial_json) => ({
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json },
    })),
    { type: "content_block_stop", index },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: {} },
    { type: "message_stop" }
  )
  return toSse(events)
}

function textRound(text: string): SseEvent[] {
  return toSse([
    { type: "message_start", message: { usage: {} } },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: {} },
    { type: "message_stop" },
  ])
}

describe("agent loop (recorded streams)", () => {
  it("mock generate script: progressive apply, one undo step, clean history", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toSse(mockEvents(false)),
        toSse(mockEvents(true)),
      ]),
    })

    await session.send("make me a coffee shop promo")

    // Scene landed with all nodes from the recorded script.
    const scene = ctrl.store.state.document.scene
    const ids = (scene.root.children ?? []).map((c) => c.id)
    expect(ids).toEqual([
      "glow",
      "eyebrow",
      "headline",
      "subhead",
      "card",
      "cta",
    ])
    expect(scene.background).toContain("radial-gradient")
    expect(scene.theme.tokens["--primary"]).toContain("oklch")

    // The whole progressive generation is exactly ONE undo step.
    expect(ctrl.history.canUndo).toBe(true)
    ctrl.undo()
    expect(ctrl.store.state.document.scene.root.children ?? []).toHaveLength(0)
    expect(ctrl.history.canUndo).toBe(false)

    // Transcript: user text, narration, applied tool chip, closing text.
    const snapshot = chat.getSnapshot()
    expect(snapshot.status).toBe("idle")
    const tool = snapshot.items.find((i) => i.kind === "tool")
    expect(tool?.kind === "tool" ? tool.state : null).toBe("applied")
    // 8 nodes: 6 top-level children + 2 nested inside the offer card
    expect(tool?.kind === "tool" ? tool.label : "").toMatch(/8 elements/)

    // API history: user → assistant(text+tool_use) → user(tool_result) → assistant(text)
    expect(chat.apiMessages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    const toolResult = chat.apiMessages[2].content[0] as {
      type: string
      content: string
    }
    expect(toolResult.type).toBe("tool_result")
    expect(toolResult.content).toContain("scene applied")
  })

  it("motif_edit: one transaction, diff result reports user edits", async () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "element.create",
      args: { node: { id: "h1", role: "headline", html: "Hi" } },
    })
    // a HUMAN edit the agent hasn't seen yet
    ctrl.dispatch({
      command: "element.setStyle",
      args: { id: "h1", css: { color: "purple" } },
    })

    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound(
          "motif_edit",
          {
            commands: [
              {
                command: "element.setHtml",
                args: { id: "h1", html: "Hello!" },
              },
              {
                command: "scene.setBackground",
                args: { value: "#123456" },
              },
            ],
          },
          { text: "Punching up the copy. " }
        ),
        textRound("Done — copy and backdrop updated."),
      ]),
    })
    await session.send("tighten this up")

    expect(ctrl.store.state.document.scene.background).toBe("#123456")
    const toolResult = chat.apiMessages[2].content[0] as { content: string }
    expect(toolResult.content).toContain("applied: 2")
    expect(toolResult.content).toContain("user edits since your last turn")

    // one batch = one history entry (plus the two setup edits)
    expect(ctrl.history.since(0)).toHaveLength(3)
  })

  it("rejected batch round-trips as an is_error tool_result", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_edit", {
          commands: [
            {
              command: "element.setHtml",
              args: { id: "ghost_zz_404", html: "x" },
            },
          ],
        }),
        textRound("I could not find that element."),
      ]),
    })
    await session.send("edit the ghost")

    const toolResult = chat.apiMessages[2].content[0] as {
      is_error?: boolean
      content: string
    }
    expect(toolResult.is_error).toBe(true)
    expect(toolResult.content).toContain("nothing applied")
    expect(ctrl.history.canUndo).toBe(false)

    const tool = chat.getSnapshot().items.find((i) => i.kind === "tool")
    expect(tool?.kind === "tool" ? tool.state : null).toBe("error")
  })

  it("motif_read returns describe() text", async () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "element.create",
      args: { node: { id: "h1", role: "headline", html: "Hi" } },
    })
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_read", { level: "tree" }),
        textRound("Read it."),
      ]),
    })
    await session.send("what's on the canvas?")
    const toolResult = chat.apiMessages[2].content[0] as { content: string }
    expect(toolResult.content).toContain("#h1")
    expect(toolResult.content).toContain("role=headline")
  })
})
