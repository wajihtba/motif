// ── M.meta — MetaStore ──
// Element metadata lives OUTSIDE the DOM in a Map.

import type { ElementMeta } from "./types"

class MetaStore {
  private map = new Map<string, ElementMeta>()

  set(id: string, data: ElementMeta) {
    this.map.set(id, data)
  }

  get(id: string): ElementMeta | undefined {
    return this.map.get(id)
  }

  update(id: string, partial: Partial<ElementMeta>) {
    const existing = this.map.get(id)
    if (existing) {
      this.map.set(id, { ...existing, ...partial })
    }
  }

  delete(id: string) {
    this.map.delete(id)
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  entries(): IterableIterator<[string, ElementMeta]> {
    return this.map.entries()
  }

  serialize(): Record<string, ElementMeta> {
    const obj: Record<string, ElementMeta> = {}
    for (const [k, v] of this.map) {
      obj[k] = { ...v }
    }
    return obj
  }

  deserialize(obj: Record<string, ElementMeta>) {
    this.map.clear()
    for (const [k, v] of Object.entries(obj)) {
      this.map.set(k, v)
    }
  }

  clear() {
    this.map.clear()
  }

  get size() {
    return this.map.size
  }
}

export const meta = new MetaStore()
