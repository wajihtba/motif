// Token → components lookup, built once from the registry's tokensUsed
// declarations. Powers the /brand editor's "used by N components" help and
// the highlight-affected-tiles affordance.

import { list } from "./components"

export interface TokenUsage {
  count: number
  ids: string[]
}

let cache: Map<string, TokenUsage> | null = null

export function tokenUsage(): Map<string, TokenUsage> {
  if (!cache) {
    cache = new Map()
    for (const def of list()) {
      for (const key of def.tokensUsed) {
        let u = cache.get(key)
        if (!u) cache.set(key, (u = { count: 0, ids: [] }))
        u.count++
        u.ids.push(def.id)
      }
    }
  }
  return cache
}

export function componentsUsing(key: string): TokenUsage {
  return tokenUsage().get(key) ?? { count: 0, ids: [] }
}
