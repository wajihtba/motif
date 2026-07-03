// The asset store — project images live as Blobs in IndexedDB and are
// referenced from scenes as `asset:<id>` URLs, which resolve to object URLs
// at DOM-build time. This closes v1's canvas-taint hazard: local blobs are
// always same-origin, so export never fails on a CORS-dirty photo.

import type { IDBPDatabase } from "idb"
import { openDB } from "idb"
import { setAssetResolver } from "../engine/html-canvas/build"

const DB = "motif"
const STORE = "assets"

let dbPromise: Promise<IDBPDatabase> | null = null
const objectUrls = new Map<string, string>()

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    },
  })
  return dbPromise
}

/** Store a blob; returns its `asset:<id>` URL for use in scenes. */
export async function putAsset(blob: Blob, id?: string): Promise<string> {
  const key =
    id ?? `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  await (await db()).put(STORE, blob, key)
  // Refresh any cached object URL for this id.
  const stale = objectUrls.get(key)
  if (stale) {
    URL.revokeObjectURL(stale)
    objectUrls.delete(key)
  }
  return `asset:${key}`
}

export async function deleteAsset(assetUrl: string): Promise<void> {
  const key = assetUrl.replace(/^asset:/, "")
  await (await db()).delete(STORE, key)
  const url = objectUrls.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(key)
  }
}

/** Warm the object-URL cache for every asset (call before scene mounts). */
export async function primeAssets(): Promise<void> {
  const d = await db()
  const keys = (await d.getAllKeys(STORE)) as string[]
  for (const key of keys) {
    if (objectUrls.has(key)) continue
    const blob = (await d.get(STORE, key)) as Blob | undefined
    if (blob) objectUrls.set(key, URL.createObjectURL(blob))
  }
}

/** Synchronous resolver the DOM builder uses (asset: → object URL). */
export function resolveAsset(assetUrl: string): string | null {
  const key = assetUrl.replace(/^asset:/, "")
  return objectUrls.get(key) ?? null
}

/** Wire the resolver into the engine's DOM builder. Call once at app start;
 *  prime again after uploads so new assets resolve. */
export function installAssetResolver(): void {
  setAssetResolver((url) =>
    url.startsWith("asset:") ? resolveAsset(url) : url
  )
}
