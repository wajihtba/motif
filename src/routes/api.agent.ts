// POST /api/agent — the ONLY file that touches the Anthropic SDK, and the
// only reason this app has a server: a safe streaming home for the API key
// (docs/plan/01-architecture.md §6). The client drives the turn loop; this
// route assembles the request (cached static prefix: tools + core system
// prompt) and re-emits the raw Messages stream as SSE.
//
// claude-opus-4-8: adaptive thinking, output_config.effort, NO sampling
// params. motif_generate streams tool input eagerly (GA, no beta header).
// Without ANTHROPIC_API_KEY the route replays a recorded mock stream so the
// full path stays demoable (M2 verify) until a key lands in .env.

import Anthropic from "@anthropic-ai/sdk"
import { createFileRoute } from "@tanstack/react-router"
import { agentTools } from "@/agent/tools"
import { CORE_SYSTEM_PROMPT } from "@/agent/prompts"
import { mockEvents } from "@/agent/mock-stream"

interface AgentRequestBody {
  messages: Anthropic.MessageParam[]
  effort?: "low" | "medium" | "high"
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as AgentRequestBody
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("messages required", { status: 400 })
        }
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) return mockResponse(body)

        const client = new Anthropic({ apiKey })
        const stream = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 64000,
          stream: true,
          thinking: { type: "adaptive" },
          output_config: { effort: body.effort ?? "high" },
          system: [
            {
              type: "text",
              text: CORE_SYSTEM_PROMPT,
              // Breakpoint after the static prefix: tools render before
              // system, so this caches tools + core prompt together.
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: agentTools() as Anthropic.ToolUnion[],
          messages: withTailBreakpoint(body.messages),
        })

        const encoder = new TextEncoder()
        const readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const event of stream) {
                if (event.type === "message_start") {
                  const u = event.message.usage
                  console.log(
                    `[agent] cache_read=${u.cache_read_input_tokens} cache_write=${u.cache_creation_input_tokens} input=${u.input_tokens}`
                  )
                }
                controller.enqueue(encoder.encode(sse(event.type, event)))
              }
            } catch (e) {
              controller.enqueue(
                encoder.encode(
                  sse("error", {
                    message: e instanceof Error ? e.message : String(e),
                  })
                )
              )
            }
            controller.close()
          },
          cancel() {
            void stream.controller.abort()
          },
        })
        return sseResponse(readable)
      },
    },
  },
})

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sseResponse(readable: ReadableStream<Uint8Array>): Response {
  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}

/** Cache the conversation tail: breakpoint on the last content block of the
 *  final message, so the next round (tool results appended) reads this whole
 *  prefix from cache. */
function withTailBreakpoint(
  messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  const out = messages.map((m) => ({ ...m }))
  const last = out[out.length - 1]
  if (Array.isArray(last.content) && last.content.length) {
    const blocks = [...last.content]
    const tail = blocks[blocks.length - 1]
    if (typeof tail === "object" && "type" in tail) {
      blocks[blocks.length - 1] = {
        ...tail,
        cache_control: { type: "ephemeral" },
      } as typeof tail
    }
    last.content = blocks
  }
  return out
}

/** Keyless dev mode: replay the recorded script with realistic pacing. */
function mockResponse(body: AgentRequestBody): Response {
  const last = body.messages[body.messages.length - 1]
  const followUp =
    Array.isArray(last.content) &&
    last.content.some(
      (b) => typeof b === "object" && "type" in b && b.type === "tool_result"
    )
  const events = mockEvents(followUp)
  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(sse(event.type, event)))
        await new Promise((r) => setTimeout(r, 24))
      }
      controller.close()
    },
  })
  return sseResponse(readable)
}
