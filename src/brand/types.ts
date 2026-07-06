// Brand — the global, project-independent identity record (the "design system
// for image generation"). A Brand lives in its own IndexedDB store and is
// edited on the /brand page; a project links to one via `brandId` and carries
// a compiled BrandSnapshot on its Document so commands and the agent can read
// brand state synchronously (store transactions are pure/sync).
//
// The shape is deliberately shadcn-config-like: theme tokens + per-component
// overrides + a motion personality, exportable as one portable JSON file
// (src/brand/brand-file.ts).

import type { Theme } from "../scene/types"

/** Per-component customization: variant picks + a bounded css patch. The css
 *  patch merges onto the component's surface node through sanitizeCss — a
 *  structured escape hatch, not freeform component editing. */
export interface ComponentOverride {
  /** Axis key → option id, e.g. { shape: "pill", size: "lg" }. */
  variants?: Record<string, string>
  /** camelCase declarations merged onto the surface node (may use var(--token)). */
  css?: Record<string, string>
  /** Excluded from this brand's catalog (UI tiles dim, agent digest omits it). */
  hidden?: boolean
}

/** Brand motion personality — preset ids from ANIM_PRESETS (effects/anims). */
export interface BrandMotion {
  /** Preferred entrance preset id: fadeIn | riseIn | slideIn | popIn. */
  entrance?: string
  /** Scales preset durations: calm 1.5x, standard 1x, snappy 0.65x. */
  pace?: "calm" | "standard" | "snappy"
  /** Seconds between staggered entrances when a track hits multiple nodes. */
  stagger?: number
  /** How much ambient motion (float/pulse/sway) the brand tolerates. */
  ambient?: "none" | "subtle" | "lively"
  /** Preferred emphasis preset for CTAs (pulse | heartbeat). */
  emphasis?: string
}

/** Duration multiplier per pace. */
export const PACE_SCALE: Record<NonNullable<BrandMotion["pace"]>, number> = {
  calm: 1.5,
  standard: 1,
  snappy: 0.65,
}

export const DEFAULT_MOTION: BrandMotion = {
  entrance: "riseIn",
  pace: "standard",
  ambient: "subtle",
  stagger: 0.12,
}

/** Brand effect defaults (consumed in a later phase). */
export interface BrandFx {
  /** Preferred curated look name from content/looks.ts. */
  look?: string
  grain?: number
  vignette?: number
}

/** The global library record (persistence BRAND_STORE). */
export interface Brand {
  id: string
  name: string
  version: 1
  /** Full token set — a superset of scene DEFAULT_THEME keys. */
  theme: Theme
  /** `asset:<id>` reference into the asset store. */
  logo?: string
  /** Tone-of-voice guidance injected into the agent prompt. */
  voice?: string
  /** Component id → override. Absent components use their registry defaults. */
  components: Record<string, ComponentOverride>
  motion: BrandMotion
  fx?: BrandFx
  createdAt: number
  updatedAt: number
}

/** What rides the Document (replaces the old BrandKit): the compiled,
 *  self-contained snapshot of the linked brand. Re-compiled from the library
 *  record on project open when the record is newer (`syncedAt`). */
export interface BrandSnapshot {
  /** Pointer into the brand library; absent = ad-hoc/legacy brand. */
  brandId?: string
  /** `Brand.updatedAt` at compile time — freshness check for sync-on-open. */
  syncedAt?: number
  tokens: Record<string, string>
  logo?: string
  voice?: string
  components: Record<string, ComponentOverride>
  motion: BrandMotion
}
