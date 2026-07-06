// Compile a library Brand record into the BrandSnapshot that rides the
// Document. Pure functions — unit-testable, no persistence imports.

import type { BrandKit } from "../scene/types"
import type { Brand, BrandSnapshot } from "./types"
import { DEFAULT_MOTION } from "./types"

export function compileBrand(brand: Brand): BrandSnapshot {
  return {
    brandId: brand.id,
    syncedAt: brand.updatedAt,
    tokens: { ...brand.theme.tokens },
    logo: brand.logo,
    voice: brand.voice,
    components: structuredClone(brand.components),
    motion: { ...DEFAULT_MOTION, ...brand.motion },
  }
}

/** Legacy shim: lift a document's old BrandKit into the snapshot shape.
 *  Stays ad-hoc (no brandId) until the user links a library brand. */
export function snapshotFromKit(kit: BrandKit): BrandSnapshot {
  const tokens: Record<string, string> = {}
  for (const [key, value] of Object.entries(kit.palette)) {
    if (key.startsWith("--")) tokens[key] = value
  }
  if (kit.fontHeading) tokens["--font-heading"] = kit.fontHeading
  if (kit.fontBody) tokens["--font-body"] = kit.fontBody
  return {
    tokens,
    logo: kit.logo,
    voice: kit.voice,
    components: {},
    motion: { ...DEFAULT_MOTION },
  }
}
