// Autosave — debounced writer from the live stores to the project record.
// Subscribes to the document store and the chat store; 500ms after the last
// change it persists document + transcript (+ a throttled canvas thumbnail).
// Exposes a tiny external store ("saved" | "saving" | "dirty") for the
// TopBar badge, same useSyncExternalStore pattern as everything else.

import type { ChatStore } from "../agent/chat"
import type { EditorController } from "../controller"
import { compactApiMessages } from "../agent/chat"
import { getProject, putProject } from "./projects"

export type SaveState = "saved" | "saving" | "dirty"

const DEBOUNCE_MS = 500
const THUMB_EVERY_MS = 5000

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null
  private stateValue: SaveState = "saved"
  private listeners = new Set<() => void>()
  private unsubs: Array<() => void> = []
  private lastThumbAt = 0
  private thumb: string | undefined
  private saving = false
  private dirtyWhileSaving = false
  private disposed = false

  constructor(
    private opts: {
      projectId: string
      ctrl: EditorController
      chat: ChatStore
      /** Small JPEG data URL from the live canvas; null when not paintable. */
      captureThumb?: () => string | null
    }
  ) {
    this.unsubs.push(
      opts.ctrl.store.subscribe(() => this.touch()),
      opts.chat.subscribe(() => this.touch())
    )
    // Best-effort flush when the tab goes away mid-debounce.
    const onHide = () => {
      if (document.visibilityState === "hidden") void this.flush()
    }
    document.addEventListener("visibilitychange", onHide)
    this.unsubs.push(() =>
      document.removeEventListener("visibilitychange", onHide)
    )
  }

  get state(): SaveState {
    return this.stateValue
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setState(s: SaveState): void {
    if (this.stateValue === s) return
    this.stateValue = s
    for (const fn of this.listeners) fn()
  }

  private touch(): void {
    if (this.disposed) return
    this.setState("dirty")
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(), DEBOUNCE_MS)
  }

  /** Save now (route unmount / tab hide). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.stateValue !== "saved") await this.save()
  }

  // No disposed guard here: dispose() flushes, and the final write must land.
  private async save(): Promise<void> {
    if (this.saving) {
      this.dirtyWhileSaving = true
      return
    }
    this.saving = true
    this.setState("saving")
    try {
      const now = Date.now()
      if (this.opts.captureThumb && now - this.lastThumbAt > THUMB_EVERY_MS) {
        this.thumb = this.opts.captureThumb() ?? this.thumb
        this.lastThumbAt = now
      }
      const document = this.opts.ctrl.store.state.document
      const chat = this.opts.chat.serialize()
      chat.apiMessages = compactApiMessages(chat.apiMessages)
      const prev = await getProject(this.opts.projectId)
      await putProject({
        id: this.opts.projectId,
        name: document.name,
        document,
        chat,
        thumb: this.thumb ?? prev?.thumb,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      })
      this.setState(this.dirtyWhileSaving ? "dirty" : "saved")
    } catch {
      this.setState("dirty") // retried on the next change
    } finally {
      this.saving = false
      if (this.dirtyWhileSaving) {
        this.dirtyWhileSaving = false
        this.touch()
      }
    }
  }

  dispose(): void {
    void this.flush()
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    for (const u of this.unsubs) u()
    this.listeners.clear()
  }
}

/** Downscaled JPEG of the live canvas for the home-grid card. */
export function canvasThumb(canvas: HTMLCanvasElement): string | null {
  if (!canvas.width || !canvas.height) return null
  const w = 320
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w))
  const small = document.createElement("canvas")
  small.width = w
  small.height = h
  const ctx = small.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(canvas, 0, 0, w, h)
  try {
    return small.toDataURL("image/jpeg", 0.7)
  } catch {
    return null // tainted canvas — never expected (assets are same-origin)
  }
}
