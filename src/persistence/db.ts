// One IndexedDB database for everything durable: project records, asset
// blobs, and the global brand library. A single shared open (and a single
// version number) so the stores can never race each other's upgrades.

import type { IDBPDatabase } from "idb"
import { openDB } from "idb"

export const ASSET_STORE = "assets"
export const PROJECT_STORE = "projects"
export const BRAND_STORE = "brands"

let dbPromise: Promise<IDBPDatabase> | null = null

export function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB("motif", 3, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(ASSET_STORE)) {
        d.createObjectStore(ASSET_STORE)
      }
      if (!d.objectStoreNames.contains(PROJECT_STORE)) {
        d.createObjectStore(PROJECT_STORE, { keyPath: "id" })
      }
      if (!d.objectStoreNames.contains(BRAND_STORE)) {
        d.createObjectStore(BRAND_STORE, { keyPath: "id" })
      }
    },
  })
  return dbPromise
}
