// Brand records — the global brand library the /brand page lists and edits.
// Mirrors projects.ts: plain JSON records in their own store, sorted by
// recency. Projects link to a brand by id and carry a compiled snapshot
// (src/brand/compile.ts) so the editor never reads this store mid-command.

import type { Brand } from "../brand/types"
import { DEFAULT_MOTION } from "../brand/types"
import { DEFAULT_THEME } from "../scene/theme"
import { db, BRAND_STORE as STORE } from "./db"

export function newBrand(name = "Untitled brand"): Brand {
  const now = Date.now()
  return {
    id: `b${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name,
    version: 1,
    theme: structuredClone(DEFAULT_THEME),
    components: {},
    motion: { ...DEFAULT_MOTION },
    createdAt: now,
    updatedAt: now,
  }
}

export async function listBrands(): Promise<Brand[]> {
  const all = (await (await db()).getAll(STORE)) as Brand[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getBrand(id: string): Promise<Brand | null> {
  return ((await (await db()).get(STORE, id)) as Brand | undefined) ?? null
}

export async function putBrand(brand: Brand): Promise<void> {
  await (await db()).put(STORE, brand)
}

export async function deleteBrand(id: string): Promise<void> {
  await (await db()).delete(STORE, id)
}

export async function duplicateBrand(id: string): Promise<Brand | null> {
  const source = await getBrand(id)
  if (!source) return null
  const copy = newBrand(`${source.name} copy`)
  const now = copy.createdAt
  const brand: Brand = {
    ...structuredClone(source),
    id: copy.id,
    name: copy.name,
    createdAt: now,
    updatedAt: now,
  }
  await putBrand(brand)
  return brand
}
