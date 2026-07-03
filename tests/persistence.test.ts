// M7 persistence gate: transcript compaction cuts only at valid replay
// boundaries, hydration settles in-flight state and drops stale undo seqs,
// and the .motif packer finds every asset reference the sanitizer can let
// through. (The IndexedDB layer itself is exercised in the browser verify —
// jsdom has no indexedDB.)

import { describe, expect, it } from "vitest"
import type { ApiMessage } from "@/agent/chat"
import { ChatStore, compactApiMessages } from "@/agent/chat"
import { emptyDocument } from "@/scene/model"
import { assetIdsIn } from "@/persistence/motif-file"

function user(text: string): ApiMessage {
  return { role: "user", content: [{ type: "text", text }] }
}
function assistant(text: string): ApiMessage {
  return { role: "assistant", content: [{ type: "text", text }] }
}
function toolResult(id: string): ApiMessage {
  return { role: "user", content: [{ type: "tool_result", tool_use_id: id }] }
}

describe("compactApiMessages", () => {
  it("keeps short histories untouched", () => {
    const msgs = [user("a"), assistant("b")]
    expect(compactApiMessages(msgs, 40)).toBe(msgs)
  })

  it("cuts at a plain user message, never inside a tool round-trip", () => {
    const msgs: ApiMessage[] = []
    for (let i = 0; i < 10; i++) {
      msgs.push(user(`turn ${i}`))
      msgs.push(assistant(`working ${i}`))
      msgs.push(toolResult(`t${i}`))
      msgs.push(assistant(`done ${i}`))
    }
    const out = compactApiMessages(msgs, 10)
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out[0].role).toBe("user")
    expect(out[0].content.some((b) => b.type === "tool_result")).toBe(false)
  })

  it("keeps everything when no clean boundary exists in the tail", () => {
    const msgs: ApiMessage[] = [user("start")]
    for (let i = 0; i < 30; i++) {
      msgs.push(assistant(`a${i}`))
      msgs.push(toolResult(`t${i}`))
    }
    expect(compactApiMessages(msgs, 10)).toHaveLength(msgs.length)
  })
})

describe("ChatStore hydrate", () => {
  it("settles streaming/running state and drops stale history seqs", () => {
    const a = new ChatStore()
    a.addText("user", "hello")
    const streamId = a.addText("assistant", "half a sen", true)
    const toolId = a.addTool("motif_generate", "Building scene…")
    a.updateTool(toolId, { historySeq: 7 })
    a.apiMessages.push(user("hello"))

    const b = new ChatStore()
    b.hydrate(a.serialize())
    const snap = b.getSnapshot()
    expect(snap.items).toHaveLength(3)
    const text = snap.items.find((i) => i.id === streamId)
    expect(text?.kind === "text" && text.streaming).toBe(false)
    const tool = snap.items.find((i) => i.id === toolId)
    if (tool?.kind !== "tool") throw new Error("tool item missing")
    expect(tool.state).toBe("applied")
    expect(tool.historySeq).toBeUndefined()
    expect(b.apiMessages).toHaveLength(1)

    // New ids never collide with hydrated ones.
    const fresh = b.addText("user", "again")
    expect(snap.items.some((i) => i.id === fresh)).toBe(false)
  })
})

describe("assetIdsIn", () => {
  it("finds node images, brand logos, and css url() references once each", () => {
    const doc = emptyDocument()
    doc.scene.root.children = [
      {
        id: "hero",
        layout: doc.scene.root.layout,
        css: { backgroundImage: "url(asset:bg-texture)" },
        image: "asset:hero-photo",
      },
      {
        id: "logo2",
        layout: doc.scene.root.layout,
        css: {},
        image: "asset:hero-photo", // duplicate reference
      },
    ]
    doc.brandKit = { palette: {}, logo: "asset:brand-logo" }
    expect(assetIdsIn(doc).sort()).toEqual([
      "bg-texture",
      "brand-logo",
      "hero-photo",
    ])
  })

  it("ignores https and data urls", () => {
    const doc = emptyDocument()
    doc.scene.root.children = [
      {
        id: "x",
        layout: doc.scene.root.layout,
        css: {},
        image: "https://example.com/a.png",
      },
    ]
    expect(assetIdsIn(doc)).toEqual([])
  })
})
