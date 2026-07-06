// Brand file — one portable, shadcn-config-like JSON per brand. The logo blob
// is inlined as base64 so the file is self-contained; import decodes it back
// into the asset store under a fresh id.

import type { Brand } from "./types"
import { DEFAULT_MOTION } from "./types"
import { DEFAULT_THEME } from "../scene/theme"
import { getAssetBlob, putAsset } from "../persistence/assets"
import { newBrand } from "../persistence/brands"

export interface BrandFile {
  $schema: string
  version: 1
  name: string
  theme: Brand["theme"]
  voice?: string
  logo?: { mime: string; data: string }
  components: Brand["components"]
  motion: Brand["motion"]
  fx?: Brand["fx"]
}

const SCHEMA = "https://motif.dev/brand.schema.json"

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ""
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

/** Serialize a brand (and its logo blob) into the portable JSON shape. */
export async function exportBrandFile(brand: Brand): Promise<BrandFile> {
  let logo: BrandFile["logo"]
  if (brand.logo) {
    const blob = await getAssetBlob(brand.logo)
    if (blob) logo = { mime: blob.type || "image/png", data: await blobToBase64(blob) }
  }
  return {
    $schema: SCHEMA,
    version: 1,
    name: brand.name,
    theme: structuredClone(brand.theme),
    voice: brand.voice,
    logo,
    components: structuredClone(brand.components),
    motion: { ...brand.motion },
    fx: brand.fx ? { ...brand.fx } : undefined,
  }
}

export function brandFileName(brand: Brand): string {
  const slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "brand"
  return `${slug}.brand.json`
}

/** Parse + validate a brand file into a fresh Brand record (new id; caller
 *  persists it). Throws with a readable message on a malformed file. */
export async function importBrandFile(json: unknown): Promise<Brand> {
  const file = json as Partial<BrandFile> | null
  if (!file || typeof file !== "object") throw new Error("not a JSON object")
  if (file.version !== 1) throw new Error(`unsupported version ${file.version}`)
  if (!file.name || typeof file.name !== "string")
    throw new Error("missing brand name")
  if (!file.theme?.tokens || typeof file.theme.tokens !== "object")
    throw new Error("missing theme tokens")

  const brand = newBrand(file.name)
  brand.theme = {
    mode: file.theme.mode === "light" ? "light" : "dark",
    // Seed defaults under the file's tokens so older files gain new keys.
    tokens: { ...DEFAULT_THEME.tokens, ...file.theme.tokens },
  }
  brand.voice = typeof file.voice === "string" ? file.voice : undefined
  brand.components =
    file.components && typeof file.components === "object"
      ? structuredClone(file.components)
      : {}
  brand.motion = { ...DEFAULT_MOTION, ...(file.motion ?? {}) }
  brand.fx = file.fx ? { ...file.fx } : undefined
  if (file.logo?.data && file.logo.mime) {
    brand.logo = await putAsset(
      base64ToBlob(file.logo.data, file.logo.mime),
      `brand-logo-${brand.id}`
    )
  }
  return brand
}
