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
}
