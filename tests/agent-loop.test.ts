// Recorded-stream replay (eval lane 2, M2 verify): the mock agent scripts
// drive the FULL client loop against a real controller — progressive
// generation, one-undo-step transactionality, diff tool results, and
// error round-trips — with no model and no network.

import { describe, expect, it } from "vitest"
import type { AgentTransport, SseEvent } from "@/agent/loop"
import type { Box, RendererBackend } from "@/engine/backend"
import { DEFAULT_GUARD_CONFIG } from "@/controller/guard/types"
import { EditorController } from "@/controller"
import { AgentSession, httpTransport } from "@/agent/loop"
import { ChatStore } from "@/agent/chat"
import { findNode } from "@/scene/model"
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

  it("layout lint warnings ride the tool_result that caused them", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    let lintCalls = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_generate", {
          root: { children: [{ id: "a", role: "headline", html: "Hi" }] },
        }),
        textRound("Fixed the spacing."),
      ]),
      lint: () => {
        lintCalls += 1
        // warn on the generate; clean by the end-of-turn check
        return Promise.resolve(
          lintCalls === 1 ? ["layout: #a overlaps #b by 320×48px"] : []
        )
      },
    })
    await session.send("make something")

    // once after motif_generate + once for the end-of-turn repair check
    expect(lintCalls).toBe(2)
    const toolResult = chat.apiMessages[2].content[0] as { content: string }
    expect(toolResult.content).toContain("scene applied")
    expect(toolResult.content).toContain("layout: #a overlaps #b by 320×48px")
    // the UI chip carries the same warnings
    const tool = chat.getSnapshot().items.find((i) => i.kind === "tool")
    expect(tool?.kind === "tool" ? tool.warnings : []).toContain(
      "layout: #a overlaps #b by 320×48px"
    )
  })

  it("lint is skipped for selection-only motif_edit batches", async () => {
    const ctrl = new EditorController()
    ctrl.dispatch({
      command: "element.create",
      args: { node: { id: "h1", role: "headline", html: "Hi" } },
    })
    const chat = new ChatStore()
    let lintCalls = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_edit", {
          commands: [{ command: "element.select", args: { ids: ["h1"] } }],
        }),
        textRound("Selected."),
      ]),
      lint: () => {
        lintCalls += 1
        return Promise.resolve([])
      },
    })
    await session.send("select the headline")
    expect(lintCalls).toBe(0)
  })

  it("auto-repair: one synthetic round when the turn ends with findings", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    const lintResults = [
      ["layout: #a overlaps #b by 100×40px"], // after motif_generate
      ["layout: #a overlaps #b by 100×40px"], // end-of-turn check → repair
      [], // after the fixing motif_edit
    ]
    let lintCalls = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_generate", {
          root: {
            children: [
              { id: "a", role: "headline", html: "Hi" },
              { id: "b", role: "subhead", html: "There" },
            ],
          },
        }),
        textRound("Done."), // model ends its turn despite the warning
        toolUseRound("motif_edit", {
          commands: [
            {
              command: "layout.stackify",
              args: { ids: ["a", "b"] },
            },
          ],
        }),
        textRound("Restacked — clean now."),
      ]),
      lint: () => Promise.resolve(lintResults[lintCalls++] ?? []),
    })
    await session.send("make something")

    // generate-lint, end-of-turn lint, edit-lint (the second end-of-turn
    // check is skipped: the one repair attempt is spent)
    expect(lintCalls).toBe(3)
    const repair = chat.apiMessages.find(
      (m) =>
        m.role === "user" &&
        JSON.stringify(m.content).includes("(automatic design check)")
    )
    expect(repair).toBeTruthy()
    expect(JSON.stringify(repair!.content)).toContain("allowOverlap")
    // the fix applied
    const root = ctrl.store.state.document.scene.root
    expect(root.children).toHaveLength(1)
    expect(root.children![0].layout.mode).toBe("stack")
  })

  it("auto-repair: not triggered when the final lint is clean", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_generate", {
          root: { children: [{ id: "a", role: "headline", html: "Hi" }] },
        }),
        textRound("Done."),
      ]),
      lint: () => Promise.resolve([]),
    })
    await session.send("make something")
    expect(
      chat.apiMessages.some((m) =>
        JSON.stringify(m.content).includes("(automatic design check)")
      )
    ).toBe(false)
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

describe("agent loop — vision review round", () => {
  const generateRound = () =>
    toolUseRound("motif_generate", {
      root: { children: [{ id: "a", role: "headline", html: "Hi" }] },
    })

  it("enabled: exactly one review round with the render attached", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    let exports = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        generateRound(),
        textRound("Done."), // clean end_turn → review round fires
        textRound("The design passes."), // model judges, ends again
      ]),
      lint: () => Promise.resolve([]),
      guardConfig: () => ({
        ...DEFAULT_GUARD_CONFIG,
        visionJudge: { enabled: true },
      }),
      reviewImage: () => {
        exports++
        return Promise.resolve("dGlueWpwZWc=")
      },
    })
    await session.send("make something")

    expect(exports).toBe(1)
    const reviews = chat.apiMessages.filter(
      (m) =>
        m.role === "user" &&
        JSON.stringify(m.content).includes("(automatic design review)")
    )
    expect(reviews).toHaveLength(1)
    const blocks = reviews[0].content
    expect(blocks[0].type).toBe("image")
    expect(
      (blocks[0] as { source: { data: string } }).source.data
    ).toBe("dGlueWpwZWc=")
    expect(JSON.stringify(blocks[1])).toContain("hierarchy")
  })

  it("disabled (default): no review round, no export", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    let exports = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([generateRound(), textRound("Done.")]),
      lint: () => Promise.resolve([]),
      reviewImage: () => {
        exports++
        return Promise.resolve("x")
      },
    })
    await session.send("make something")
    expect(exports).toBe(0)
    expect(
      chat.apiMessages.some((m) =>
        JSON.stringify(m.content).includes("(automatic design review)")
      )
    ).toBe(false)
  })

  it("runs after the repair round when warnings persisted", async () => {
    const ctrl = new EditorController()
    const chat = new ChatStore()
    const lintResults = [
      ["layout: #a overlaps #b by 100×40px"], // generate
      ["layout: #a overlaps #b by 100×40px"], // end-of-turn → repair round
      ["layout: #a overlaps #b by 100×40px"], // model refused → review still runs
    ]
    let lintCalls = 0
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        generateRound(),
        textRound("Done."), // ends with warnings → repair
        textRound("Keeping the layout."), // refuses → review round
        textRound("Passes."),
      ]),
      lint: () => Promise.resolve(lintResults[lintCalls++] ?? []),
      guardConfig: () => ({
        ...DEFAULT_GUARD_CONFIG,
        visionJudge: { enabled: true },
      }),
      reviewImage: () => Promise.resolve("aW1n"),
    })
    await session.send("make something")

    const kinds = chat.apiMessages
      .filter((m) => m.role === "user")
      .map((m) => JSON.stringify(m.content))
    expect(kinds.some((c) => c.includes("(automatic design check)"))).toBe(true)
    expect(
      kinds.filter((c) => c.includes("(automatic design review)"))
    ).toHaveLength(1)
  })
})

describe("agent loop — design-guard pass (real backend measure path)", () => {
  // jsdom has no FontFaceSet — lintAfterSettle races document.fonts.ready,
  // so give it a resolved stand-in (the DOM lib types hide the gap, hence
  // no existence check).
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  })

  /** Minimal RendererBackend whose measure() mirrors the current normalized
   *  dx/dy — a setLayout nudge "sticks" exactly as a live renderer would. */
  function stubBackend(
    ctrl: EditorController,
    initBoxes: Record<string, Box | undefined>
  ): RendererBackend {
    return {
      capabilities: { liveCanvas: false, shaders: false, video: false },
      stage: document.createElement("div"),
      mount: () => {},
      setScene: () => {},
      setSampler: () => {},
      setContinuous: () => {},
      invalidate: () => {},
      renderFrame: () => {},
      measure: (id) => {
        const init = initBoxes[id]
        if (!init) return null
        const n = findNode(ctrl.store.state.document.scene, id)
        const layout = n?.layout as { dx?: number; dy?: number } | undefined
        return {
          x: init.x + (layout?.dx ?? 0) * 1080,
          y: init.y + (layout?.dy ?? 0) * 1080,
          w: init.w,
          h: init.h,
        }
      },
      whenIdle: () => Promise.resolve(),
      dispose: () => {},
    }
  }

  it("deterministic layout fix applies silently; the model sees no warnings", async () => {
    const ctrl = new EditorController()
    const backend = stubBackend(ctrl, {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 180, w: 400, h: 60 }, // 40px collision with a
    })
    ctrl.attachBackend(backend)
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_generate", {
          root: {
            children: [
              { id: "a", role: "headline", html: "Hi" },
              { id: "b", role: "subhead", html: "There" },
            ],
          },
        }),
        textRound("Done."),
      ]),
      guardConfig: () => ({ ...DEFAULT_GUARD_CONFIG, agentAutofix: true }),
    })
    await session.send("make something")

    // The fix landed as its own history entry…
    const fixEntry = ctrl.history
      .since(0)
      .find((e) => e.label === "Design auto-fix")
    expect(fixEntry).toBeTruthy()
    // …the tool result carried no layout warnings…
    const toolResult = chat.apiMessages[2].content[0] as { content: string }
    expect(toolResult.content).not.toContain("layout:")
    // …and no repair round was requested.
    expect(
      chat.apiMessages.some((m) =>
        JSON.stringify(m.content).includes("(automatic design check)")
      )
    ).toBe(false)
  })

  it("agentAutofix off: warnings ride to the model instead", async () => {
    const ctrl = new EditorController()
    const backend = stubBackend(ctrl, {
      a: { x: 100, y: 100, w: 400, h: 120 },
      b: { x: 120, y: 180, w: 400, h: 60 },
    })
    ctrl.attachBackend(backend)
    const chat = new ChatStore()
    const session = new AgentSession({
      ctrl,
      chat,
      transport: scriptedTransport([
        toolUseRound("motif_generate", {
          root: {
            children: [
              { id: "a", role: "headline", html: "Hi" },
              { id: "b", role: "subhead", html: "There" },
            ],
          },
        }),
        textRound("Done."),
        textRound("Keeping the layout."), // repair round answer
      ]),
      guardConfig: () => ({ ...DEFAULT_GUARD_CONFIG, agentAutofix: false }),
    })
    await session.send("make something")

    const fixEntry = ctrl.history
      .since(0)
      .find((e) => e.label === "Design auto-fix")
    expect(fixEntry).toBeUndefined()
    const toolResult = chat.apiMessages[2].content[0] as { content: string }
    expect(toolResult.content).toContain("layout:")
    expect(toolResult.content).toContain("overlaps")
  })
})
