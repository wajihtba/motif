// Chat state — a tiny external store (same useSyncExternalStore pattern as
// the document store). Holds the UI transcript (text + tool chips) and the
// exact API message history for multi-turn replay. The transcript is
// presentation state, not document state: it never enters undo history.

export type ChatStatus = "idle" | "running" | "error"

export interface ChatTextItem {
  id: string
  kind: "text"
  role: "user" | "assistant"
  text: string
  streaming: boolean
}

export interface ChatToolItem {
  id: string
  kind: "tool"
  name: string
  /** Live label: "Building scene… 4 elements" / "Applied 6 edits". */
  label: string
  state: "running" | "applied" | "error"
  warnings: string[]
  error?: string
  /** History seq of the entry this call produced — drives the Undo pill. */
  historySeq?: number
  undone?: boolean
}

export type ChatItem = ChatTextItem | ChatToolItem

/** Structural mirror of the Messages API param shape (kept local so client
 *  bundles don't need SDK runtime imports). */
export interface ApiMessage {
  role: "user" | "assistant"
  content: Array<Record<string, unknown>>
}

export class ChatStore {
  private itemsList: ChatItem[] = []
  private statusValue: ChatStatus = "idle"
  private errorText: string | null = null
  private listeners = new Set<() => void>()
  private counter = 0
  private snapshot: {
    items: ChatItem[]
    status: ChatStatus
    error: string | null
  } = { items: [], status: "idle", error: null }

  /** API replay history (clean — per-turn context blocks are appended at
   *  request time, never stored). */
  readonly apiMessages: ApiMessage[] = []

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot() {
    return this.snapshot
  }

  private emit(): void {
    this.snapshot = {
      items: [...this.itemsList],
      status: this.statusValue,
      error: this.errorText,
    }
    for (const fn of this.listeners) fn()
  }

  setStatus(status: ChatStatus, error?: string): void {
    this.statusValue = status
    this.errorText = error ?? null
    this.emit()
  }

  addText(role: "user" | "assistant", text = "", streaming = false): string {
    const id = `c${++this.counter}`
    this.itemsList.push({ id, kind: "text", role, text, streaming })
    this.emit()
    return id
  }

  appendText(id: string, delta: string): void {
    const item = this.itemsList.find((i) => i.id === id)
    if (item?.kind === "text") {
      item.text += delta
      this.emit()
    }
  }

  finishText(id: string): void {
    const item = this.itemsList.find((i) => i.id === id)
    if (item?.kind === "text") {
      item.streaming = false
      // Drop empty streamed text blocks entirely.
      if (!item.text.trim()) {
        this.itemsList = this.itemsList.filter((i) => i.id !== id)
      }
      this.emit()
    }
  }

  addTool(name: string, label: string): string {
    const id = `c${++this.counter}`
    this.itemsList.push({
      id,
      kind: "tool",
      name,
      label,
      state: "running",
      warnings: [],
    })
    this.emit()
    return id
  }

  updateTool(
    id: string,
    patch: Partial<Omit<ChatToolItem, "id" | "kind">>
  ): void {
    const item = this.itemsList.find((i) => i.id === id)
    if (item?.kind === "tool") {
      Object.assign(item, patch)
      this.emit()
    }
  }

  /** Flip chips to "Undone" when their history entry is reverted. */
  markUndone(seq: number, undone: boolean): void {
    for (const item of this.itemsList) {
      if (item.kind === "tool" && item.historySeq === seq) item.undone = undone
    }
    this.emit()
  }

  /** Snapshot for persistence (autosave / .motif export). */
  serialize(): { items: ChatItem[]; apiMessages: ApiMessage[] } {
    return { items: [...this.itemsList], apiMessages: [...this.apiMessages] }
  }

  /** Restore a persisted transcript. Streaming/running flags are settled and
   *  history seqs dropped — they referenced a previous session's undo stack —
   *  and the API history is compacted so long projects replay affordably. */
  hydrate(stored: { items: ChatItem[]; apiMessages: ApiMessage[] }): void {
    this.itemsList = stored.items.map((i) =>
      i.kind === "text"
        ? { ...i, streaming: false }
        : {
            ...i,
            state: i.state === "running" ? ("applied" as const) : i.state,
            historySeq: undefined,
            undone: false,
          }
    )
    for (const item of this.itemsList) {
      const n = Number(item.id.replace(/^c/, ""))
      if (Number.isFinite(n)) this.counter = Math.max(this.counter, n)
    }
    this.apiMessages.length = 0
    this.apiMessages.push(...compactApiMessages(stored.apiMessages))
    this.emit()
  }
}

/** Trim replay history to roughly the last `max` messages, cutting only at a
 *  plain user message (never between a tool_use and its tool_result) so the
 *  remainder is still a valid Messages-API conversation. Durable intent
 *  survives compaction by design: the brief + brand kit live on the document
 *  and are re-injected into every turn's context block. */
export function compactApiMessages(
  messages: ApiMessage[],
  max = 40
): ApiMessage[] {
  if (messages.length <= max) return messages
  for (let i = messages.length - max; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === "user" && !m.content.some((b) => b.type === "tool_result")) {
      return messages.slice(i)
    }
  }
  // No clean boundary in the tail — keep everything rather than corrupt it.
  return messages
}
