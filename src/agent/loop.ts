// The client-side turn driver (docs/plan/01-architecture.md §6): tools must
// execute in the browser (the document, engine and history live here), so the
// loop runs client-side against the server's SSE proxy.
//
//   send user text → POST /api/agent → consume SSE
//     text deltas        → chat transcript
//     motif_generate     → progressive scene.apply while input streams
//     stop_reason=tool_use → execute tools via dispatch → tool_results → loop
//   until end_turn (or the iteration cap / abort).
//
// Every tool result is a compact DIFF, not the world model — applied counts,
// repair warnings, and the user's edits since the agent's last action
// (docs/plan/03-agent-first.md §4). The transport is injectable so recorded
// streams can drive the whole loop in tests.

import type { EditorController, CommandCall } from "../controller"
import type { ApiMessage, ChatStore } from "./chat"
import type { GuardConfig } from "../controller/guard/types"
import { brandDigest } from "../brand/digest"
import { exportImage } from "../engine/export"
import { runGuardPass } from "../controller/guard/run"
import { getGuardConfig } from "../persistence/settings"
import { buildJudgeMessage, judgeCriteria } from "./judge"
import { contextBlock } from "./prompts"
import { parsePartialJson } from "./partial-json"

export interface SseEvent {
  event: string
  data: Record<string, unknown>
}

export interface AgentRequestBody {
  messages: ApiMessage[]
  effort?: "low" | "medium" | "high"
}

export type AgentTransport = (
  body: AgentRequestBody,
  signal: AbortSignal
) => Promise<AsyncIterable<SseEvent>>

const MAX_ROUNDS = 12

export interface AgentSessionDeps {
  ctrl: EditorController
  chat: ChatStore
  transport: AgentTransport
  /** Deliver an exported file to the user (browser download). */
  deliverFile?: (blob: Blob, filename: string) => void
  /** Layout lint hook — `layout:` warning lines appended to the tool result
   *  after a scene-changing call settles. Injectable for headless tests; the
   *  default measures the live backend (lintAfterSettle). */
  lint?: () => Promise<string[]>
  /** Guard config source — injectable for tests; defaults to the persisted
   *  app settings (src/persistence/settings.ts). */
  guardConfig?: () => GuardConfig
  /** Render-for-review source (base64 JPEG) — injectable for tests; the
   *  default exports the scene and downscales it (reviewJpeg). */
  reviewImage?: () => Promise<string>
}

export class AgentSession {
  private abortController: AbortController | null = null
  /** History seq at the end of the agent's last applied action. */
  private lastSeenSeq = 0
  /** Whether this send() ran a scene-changing tool (gates the final lint). */
  private sceneChanged = false
  /** The one automatic repair request per send() has been spent. */
  private repairAttempted = false
  /** Nodes already given their one automatic contrast fix this send(). */
  private contrastFixAttempted = new Set<string>()
  /** Finding keys (`rule:ids`) already given their one deterministic layout
   *  fix this send() — a fix that didn't stick rides to the model instead. */
  private guardFixAttempted = new Set<string>()
  /** The one vision-review round per send() has been spent. */
  private judgeAttempted = false

  constructor(private deps: AgentSessionDeps) {}

  abort(): void {
    this.abortController?.abort()
  }

  get running(): boolean {
    return this.abortController !== null
  }

  async send(userText: string): Promise<void> {
    const { chat } = this.deps
    if (this.running) return
    this.abortController = new AbortController()
    this.sceneChanged = false
    this.repairAttempted = false
    this.contrastFixAttempted.clear()
    this.guardFixAttempted.clear()
    this.judgeAttempted = false
    chat.addText("user", userText)
    chat.apiMessages.push({
      role: "user",
      content: [{ type: "text", text: userText }],
    })
    chat.setStatus("running")
    try {
      await this.runRounds()
      chat.setStatus("idle")
    } catch (e) {
      if (this.abortController.signal.aborted) {
        chat.setStatus("idle")
      } else {
        chat.setStatus("error", e instanceof Error ? e.message : String(e))
      }
    } finally {
      this.abortController = null
      this.lastSeenSeq = this.deps.ctrl.history.lastSeq
    }
  }

  private async runRounds(): Promise<void> {
    const { chat, transport } = this.deps
    const signal = this.abortController!.signal
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const events = await transport(
        { messages: this.messagesWithContext() },
        signal
      )
      const outcome = await this.consumeStream(events)
      chat.apiMessages.push({ role: "assistant", content: outcome.blocks })
      if (outcome.stopReason !== "tool_use" || !outcome.toolUses.length) {
        // The model is done — but if it left measured layout violations on the
        // canvas, spend ONE extra round asking it to fix or mark them. Only on
        // a clean end_turn: a max_tokens stop can leave dangling tool_use
        // blocks that a text-only follow-up message would 400 on.
        if (
          outcome.stopReason === "end_turn" &&
          (await this.maybeRequestRepair())
        ) {
          continue
        }
        return
      }

      const results: Array<Record<string, unknown>> = []
      for (const tool of outcome.toolUses) {
        results.push(await this.executeTool(tool))
      }
      chat.apiMessages.push({ role: "user", content: results })
    }
    chat.addText(
      "assistant",
      "(stopped: reached the per-turn tool budget — send a message to continue)"
    )
  }

  /** Clone the history and append the volatile context to the LAST user
   *  message — after the cached prefix (docs/plan/03-agent-first.md §7). */
  private messagesWithContext(): ApiMessage[] {
    const { ctrl } = this.deps
    const messages = this.deps.chat.apiMessages.map((m) => ({
      ...m,
      content: [...m.content],
    }))
    const last = messages[messages.length - 1]
    if (last.role === "user") {
      const state = ctrl.store.state
      const brand = state.document.brand
      last.content.push({
        type: "text",
        text: contextBlock({
          summary: ctrl.describe({ level: "summary" }),
          selection: state.selection,
          userEdits: this.userEditsSince(),
          brand: brand ? brandDigest(brand) : undefined,
        }),
      })
    }
    return messages
  }

  private userEditsSince(): string[] {
    return this.deps.ctrl.history
      .since(this.lastSeenSeq)
      .filter((e) => e.source === "user")
      .map((e) => e.label)
  }

  // --- stream consumption ---------------------------------------------------

  private async consumeStream(events: AsyncIterable<SseEvent>): Promise<{
    stopReason: string | null
    blocks: Array<Record<string, unknown>>
    toolUses: ToolUse[]
  }> {
    const { chat } = this.deps
    const blocks: Array<Record<string, unknown>> = []
    const toolUses: ToolUse[] = []
    let stopReason: string | null = null

    // Per-index live block state.
    const open = new Map<
      number,
      | { kind: "text"; chatId: string; text: string }
      | { kind: "thinking" }
      | {
          kind: "tool"
          chatId: string
          toolId: string
          name: string
          json: string
          generate: ProgressiveGenerate | null
        }
    >()

    for await (const { event, data } of events) {
      if (event === "error") {
        throw new Error(
          String((data as { message?: string }).message ?? "stream error")
        )
      }
      switch (event) {
        case "content_block_start": {
          const index = data.index as number
          const block = data.content_block as Record<string, unknown>
          if (block.type === "text") {
            open.set(index, {
              kind: "text",
              chatId: chat.addText("assistant", "", true),
              text: "",
            })
          } else if (block.type === "tool_use") {
            const name = block.name as string
            open.set(index, {
              kind: "tool",
              chatId: chat.addTool(name, startLabel(name)),
              toolId: block.id as string,
              name,
              json: "",
              generate:
                name === "motif_generate"
                  ? new ProgressiveGenerate(this.deps.ctrl, (n) =>
                      chat.updateTool(this.mustOpenTool(open, index).chatId, {
                        label: `Building the scene… ${n} elements`,
                      })
                    )
                  : null,
            })
          } else {
            open.set(index, { kind: "thinking" })
          }
          break
        }
        case "content_block_delta": {
          const index = data.index as number
          const delta = data.delta as Record<string, unknown>
          const state = open.get(index)
          if (!state) break
          if (state.kind === "text" && delta.type === "text_delta") {
            state.text += delta.text as string
            chat.appendText(state.chatId, delta.text as string)
          } else if (
            state.kind === "tool" &&
            delta.type === "input_json_delta"
          ) {
            state.json += delta.partial_json as string
            state.generate?.update(state.json)
          }
          break
        }
        case "content_block_stop": {
          const index = data.index as number
          const state = open.get(index)
          if (!state) break
          if (state.kind === "text") {
            chat.finishText(state.chatId)
            if (state.text) blocks.push({ type: "text", text: state.text })
          } else if (state.kind === "tool") {
            let input: unknown = {}
            try {
              input = state.json ? JSON.parse(state.json) : {}
            } catch {
              input = parsePartialJson(state.json) ?? {}
            }
            blocks.push({
              type: "tool_use",
              id: state.toolId,
              name: state.name,
              input,
            })
            toolUses.push({
              id: state.toolId,
              name: state.name,
              input,
              chatId: state.chatId,
              generate: state.generate,
            })
          }
          open.delete(index)
          break
        }
        case "message_delta": {
          const delta = data.delta as Record<string, unknown> | undefined
          if (delta?.stop_reason) stopReason = delta.stop_reason as string
          break
        }
        default:
          break
      }
    }
    return { stopReason, blocks, toolUses }
  }

  private mustOpenTool(
    open: Map<number, { kind: string; chatId?: string }>,
    index: number
  ): { chatId: string } {
    const s = open.get(index)
    if (!s || s.kind !== "tool" || !s.chatId) throw new Error("tool state lost")
    return s as { chatId: string }
  }

  /** End-of-turn guard: when the turn changed the scene and unresolved
   *  `layout:` findings remain, inject one synthetic user message asking the
   *  model to fix or mark them, and continue the round loop. Once per send —
   *  a model that insists twice keeps its layout (flexibility over nagging).
   *  After the deterministic channel is done (clean, or its repair round
   *  spent), the optional vision-review round runs — also once per send. */
  private async maybeRequestRepair(): Promise<boolean> {
    if (!this.sceneChanged) return false
    const config = (this.deps.guardConfig ?? getGuardConfig)()
    const judgePending = config.visionJudge.enabled && !this.judgeAttempted
    // Both once-per-send rounds spent → nothing left to ask, skip the
    // measure pass entirely (the pre-judge behavior, preserved).
    if (this.repairAttempted && !judgePending) return false
    const seqBefore = this.deps.ctrl.history.lastSeq
    const lines = await this.lintAfterSettle()
    // An abort mid-measure must not leave a stale synthetic message behind.
    if (this.abortController?.signal.aborted) return false
    // Don't fight the user: if they edited while we were measuring, the
    // findings may be theirs (mid-drag, deliberate layering) — stand down.
    const userEdited = this.deps.ctrl.history
      .since(seqBefore)
      .some((e) => e.source === "user")
    if (userEdited) return false
    if (lines.length && !this.repairAttempted) {
      this.repairAttempted = true
      this.deps.chat.apiMessages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `(automatic design check) unresolved warnings:\n${lines.join(
              "\n"
            )}\nFix them now with motif_edit — or mark what is intentional (allowOverlap: true for layering, allowLowContrast: true for decorative low-contrast text).`,
          },
        ],
      })
      return true
    }
    return this.maybeRequestReview(seqBefore, config)
  }

  /** The vision-review round (agent/judge.ts): export the settled render,
   *  hand it back to the model with the critique brief. Config-gated, once
   *  per send, and it stands down on abort or user edits like the repair. */
  private async maybeRequestReview(
    seqBefore: number,
    config: GuardConfig
  ): Promise<boolean> {
    if (!config.visionJudge.enabled || this.judgeAttempted) return false
    this.judgeAttempted = true
    try {
      const jpeg = await (this.deps.reviewImage ?? (() => this.defaultReviewImage()))()
      if (this.abortController?.signal.aborted) return false
      const userEdited = this.deps.ctrl.history
        .since(seqBefore)
        .some((e) => e.source === "user")
      if (userEdited) return false
      this.deps.chat.apiMessages.push({
        role: "user",
        content: buildJudgeMessage(jpeg, judgeCriteria(config)),
      })
      return true
    } catch {
      return false // a failed export must never break the turn
    }
  }

  private async defaultReviewImage(): Promise<string> {
    const blob = await exportImage(
      this.deps.ctrl.store.state.document.scene,
      "jpeg"
    )
    return reviewJpeg(blob)
  }

  /** Measure-based design-guard pass, run after the applied scene settles
   *  (images decoded, fonts swapped, boxes fresh): every enabled rule lints,
   *  deterministic fixes apply where math can settle the issue (bounded,
   *  once per finding per send — see controller/guard/run.ts), and what's
   *  left returns as `layout:` / `contrast:` warning lines. Never throws — a
   *  lint failure must not break the tool loop. */
  private async lintAfterSettle(): Promise<string[]> {
    try {
      if (this.deps.lint) return await this.deps.lint()
      const { ctrl } = this.deps
      const backend = ctrl.backendRef
      if (!backend) return []
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 500)),
      ])
      await backend.whenIdle()
      const { lines } = await runGuardPass({
        ctrl,
        backend,
        config: (this.deps.guardConfig ?? getGuardConfig)(),
        fixAttempted: this.guardFixAttempted,
        contrastFixAttempted: this.contrastFixAttempted,
        onFixed: () => {
          this.lastSeenSeq = ctrl.history.lastSeq
        },
      })
      return lines
    } catch {
      return []
    }
  }

  // --- tool execution ---------------------------------------------------------

  private async executeTool(tool: ToolUse): Promise<Record<string, unknown>> {
    const { chat } = this.deps
    let content: string | Array<Record<string, unknown>>
    let isError = false
    try {
      content = await this.runTool(tool)
    } catch (e) {
      content = e instanceof Error ? e.message : String(e)
      isError = true
      chat.updateTool(tool.chatId, {
        state: "error",
        error: content,
        label: failLabel(tool.name),
      })
    }
    return {
      type: "tool_result",
      tool_use_id: tool.id,
      content,
      ...(isError && { is_error: true }),
    }
  }

  private async runTool(
    tool: ToolUse
  ): Promise<string | Array<Record<string, unknown>>> {
    const { ctrl, chat } = this.deps
    const input = (tool.input ?? {}) as Record<string, unknown>

    switch (tool.name) {
      case "motif_generate": {
        const result = tool.generate
          ? tool.generate.finalize(input)
          : ctrl.dispatch(
              { command: "scene.apply", args: input },
              { source: "agent", label: "Generate scene" }
            )
        if (!result.ok) {
          throw new Error(`rejected: ${result.errors.join("; ")}`)
        }
        this.sceneChanged = true
        const nodes = countNodes(input)
        const warnings = [...result.warnings, ...(await this.lintAfterSettle())]
        chat.updateTool(tool.chatId, {
          state: "applied",
          label: `Generated the scene · ${nodes} elements`,
          warnings,
          historySeq: result.entry?.seq,
        })
        this.lastSeenSeq = ctrl.history.lastSeq
        return diffText("scene applied", warnings, this.userEditsSince())
      }

      case "motif_edit": {
        const calls = (input.commands ?? []) as CommandCall[]
        const userEdits = this.userEditsSince()
        const result = ctrl.dispatch(calls, {
          source: "agent",
          label: `Agent · ${calls.length} edits`,
        })
        if (!result.ok) {
          throw new Error(
            `batch rejected, nothing applied: ${result.errors.join("; ")}`
          )
        }
        // Lint only when the batch could have moved boxes (skip fx/anim/select).
        const layoutAffecting =
          result.entry &&
          ["style", "layout", "structure", "scene"].includes(
            result.invalidation
          )
        if (layoutAffecting) this.sceneChanged = true
        const warnings = layoutAffecting
          ? [...result.warnings, ...(await this.lintAfterSettle())]
          : result.warnings
        chat.updateTool(tool.chatId, {
          state: "applied",
          label: `Applied ${result.applied} edit${result.applied === 1 ? "" : "s"}`,
          warnings,
          historySeq: result.entry?.seq,
        })
        this.lastSeenSeq = ctrl.history.lastSeq
        const returns = result.returns.filter((r) => typeof r === "string")
        return diffText(
          `applied: ${result.applied}` +
            (returns.length ? ` · created: ${returns.join(", ")}` : ""),
          warnings,
          userEdits
        )
      }

      case "motif_read": {
        const level = (input.level ?? "summary") as
          "summary" | "tree" | "node" | "capabilities"
        const text = ctrl.describe({
          level,
          ...(typeof input.id === "string" && { id: input.id }),
        })
        chat.updateTool(tool.chatId, {
          state: "applied",
          label: `Read the ${level}`,
        })
        return text
      }

      case "motif_export": {
        const type = input.type === "jpeg" ? "jpeg" : "png"
        const blob = await exportImage(ctrl.store.state.document.scene, type)
        if (input.review === true) {
          // Review pass: the render goes back to the MODEL, not the user.
          // Downscaled + re-encoded JPEG — a full-res PNG in the transcript
          // would ride every later request (and can exceed API image limits).
          chat.updateTool(tool.chatId, {
            state: "applied",
            label: "Reviewing the render",
          })
          return [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: await reviewJpeg(blob),
              },
            },
            {
              type: "text",
              text: "render attached for your review (downscaled) — export again without review to deliver the file to the user",
            },
          ]
        }
        this.deps.deliverFile?.(
          blob,
          `${ctrl.store.state.document.name || "motif"}.${type === "jpeg" ? "jpg" : "png"}`
        )
        chat.updateTool(tool.chatId, {
          state: "applied",
          label: `Exported ${type.toUpperCase()}`,
        })
        return `exported ${type} and delivered as a download`
      }

      default:
        throw new Error(`unknown tool "${tool.name}"`)
    }
  }
}

interface ToolUse {
  id: string
  name: string
  input: unknown
  chatId: string
  generate: ProgressiveGenerate | null
}

// --- progressive generation ---------------------------------------------------

/** Applies motif_generate's streaming input as it closes: background/theme
 *  first, then each COMPLETE child of root (the last child may be truncated,
 *  so it waits for its successor). All within one gesture = one undo step. */
class ProgressiveGenerate {
  private began = false
  private appliedChildren = -1

  constructor(
    private ctrl: EditorController,
    private onProgress: (nodes: number) => void
  ) {}

  update(accumulated: string): void {
    const parsed = parsePartialJson(accumulated)
    if (!parsed || typeof parsed !== "object") return
    const scene = parsed as Record<string, unknown>
    const root = scene.root as { children?: unknown[] } | undefined
    const children = Array.isArray(root?.children) ? root.children : []
    // The final child may still be streaming — hold it back.
    const complete = Math.max(children.length - 1, 0)
    const ready = Boolean(scene.background || scene.theme || complete > 0)
    if (!ready) return
    if (!this.began) {
      this.ctrl.beginGesture("Generate scene")
      this.began = true
    }
    if (complete === this.appliedChildren) return
    this.appliedChildren = complete
    this.ctrl.dispatch(
      {
        command: "scene.apply",
        args: {
          ...scene,
          ...(root && {
            root: { ...root, children: children.slice(0, complete) },
          }),
        },
      },
      { source: "agent" }
    )
    this.onProgress(complete)
  }

  finalize(input: Record<string, unknown>) {
    const result = this.ctrl.dispatch(
      { command: "scene.apply", args: input },
      { source: "agent" }
    )
    const entry = this.began ? this.ctrl.endGesture() : result.entry
    return { ...result, entry: entry ?? result.entry }
  }
}

// --- helpers --------------------------------------------------------------------

function startLabel(name: string): string {
  switch (name) {
    case "motif_generate":
      return "Building the scene…"
    case "motif_edit":
      return "Applying edits…"
    case "motif_read":
      return "Reading the canvas…"
    case "motif_export":
      return "Exporting…"
    default:
      return name
  }
}

function failLabel(name: string): string {
  return name === "motif_edit" ? "Edits rejected" : `${name} failed`
}

function diffText(
  head: string,
  warnings: string[],
  userEdits: string[]
): string {
  return [
    head,
    warnings.length ? `warnings: ${warnings.join("; ")}` : null,
    userEdits.length
      ? `user edits since your last turn: ${userEdits.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

/** Downscale a render to a transcript-friendly review image (≤1280px long
 *  edge, JPEG). The API resizes big images anyway — send fewer bytes. */
async function reviewJpeg(blob: Blob): Promise<string> {
  const MAX_EDGE = 1280
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("review re-encode failed"))),
      "image/jpeg",
      0.85
    )
  })
  return blobToBase64(jpeg)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ""
  const CHUNK = 0x8000 // String.fromCharCode arg-spread stack limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function countNodes(input: unknown): number {
  let count = 0
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return
    count += 1
    const children = (n as { children?: unknown[] }).children
    if (Array.isArray(children)) children.forEach(walk)
  }
  const root = (input as { root?: unknown }).root
  if (root) walk(root)
  return Math.max(count - 1, 0) // don't count the root container
}

// --- HTTP transport ---------------------------------------------------------------

export function httpTransport(url = "/api/agent"): AgentTransport {
  return async (body, signal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      throw new Error(`agent request failed (${res.status})`)
    }
    return parseSse(res.body, signal)
  }
}

async function* parseSse(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncIterable<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        let event = "message"
        let data = ""
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7)
          else if (line.startsWith("data: ")) data += line.slice(6)
        }
        if (data) {
          yield { event, data: JSON.parse(data) as Record<string, unknown> }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
