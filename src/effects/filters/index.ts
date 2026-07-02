// Filter catalogue — ctx.filter visual effects applied around an element's draw.
//
// Built from legacy elementfx.ts (FILTERS[] + the filterCss switch): each def
// co-locates its identity with the exact CSS string the switch returned for that
// id. The strings are byte-identical to the legacy switch. Only `hue` reads time
// (animated), so it takes `t`; every other css ignores its args.

import type { FilterDef } from "../core/types"
import { registerAll } from "../core/registry"

const none: FilterDef = {
  kind: "filter",
  id: "none",
  name: "None",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "none",
}

const glow: FilterDef = {
  kind: "filter",
  id: "glow",
  name: "Glow",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "drop-shadow(0 0 8px #ffffff) drop-shadow(0 0 22px #66ccff)",
}

const neon: FilterDef = {
  kind: "filter",
  id: "neon",
  name: "Neon",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 16px #0099ff) saturate(1.5) brightness(1.08)",
}

const shadow: FilterDef = {
  kind: "filter",
  id: "shadow",
  name: "Shadow",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "drop-shadow(0 16px 24px rgba(0,0,0,0.55))",
}

const blur: FilterDef = {
  kind: "filter",
  id: "blur",
  name: "Blur",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "blur(3px)",
}

const hue: FilterDef = {
  kind: "filter",
  id: "hue",
  name: "Hue cycle",
  group: "Filter",
  animated: true,
  params: [],
  css: (t: number): string =>
    `hue-rotate(${Math.round((t * 60) % 360)}deg) saturate(1.4)`,
}

const vivid: FilterDef = {
  kind: "filter",
  id: "vivid",
  name: "Vivid",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "saturate(1.9) contrast(1.15)",
}

const grayscale: FilterDef = {
  kind: "filter",
  id: "grayscale",
  name: "Mono",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "grayscale(1)",
}

const sepia: FilterDef = {
  kind: "filter",
  id: "sepia",
  name: "Sepia",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "sepia(0.85) contrast(1.05)",
}

const invert: FilterDef = {
  kind: "filter",
  id: "invert",
  name: "Invert",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "invert(1) hue-rotate(180deg)",
}

const dreamy: FilterDef = {
  kind: "filter",
  id: "dreamy",
  name: "Dreamy",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "brightness(1.12) saturate(1.25) contrast(0.95) drop-shadow(0 0 14px rgba(255,190,225,0.55))",
}

const noir: FilterDef = {
  kind: "filter",
  id: "noir",
  name: "Noir",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string => "grayscale(1) contrast(1.45) brightness(0.92)",
}

const vaporwave: FilterDef = {
  kind: "filter",
  id: "vaporwave",
  name: "Vaporwave",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "saturate(1.7) hue-rotate(280deg) contrast(1.1) brightness(1.05)",
}

const cyberpunk: FilterDef = {
  kind: "filter",
  id: "cyberpunk",
  name: "Cyberpunk",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "saturate(1.8) contrast(1.2) hue-rotate(170deg) drop-shadow(0 0 6px #00ffff) drop-shadow(0 0 10px #ff00aa)",
}

const frost: FilterDef = {
  kind: "filter",
  id: "frost",
  name: "Frost",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "brightness(1.15) saturate(0.78) contrast(0.95) blur(0.4px)",
}

const warm: FilterDef = {
  kind: "filter",
  id: "warm",
  name: "Warm",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "sepia(0.32) saturate(1.35) brightness(1.05) contrast(1.05)",
}

const cool: FilterDef = {
  kind: "filter",
  id: "cool",
  name: "Cool",
  group: "Filter",
  animated: false,
  params: [],
  css: (): string =>
    "saturate(1.12) hue-rotate(-16deg) brightness(1.02) contrast(1.06)",
}

/** Every filter def, in legacy FILTERS[] order, `none` first. */
export const FILTERS: FilterDef[] = [
  none,
  glow,
  neon,
  shadow,
  blur,
  hue,
  vivid,
  grayscale,
  sepia,
  invert,
  dreamy,
  noir,
  vaporwave,
  cyberpunk,
  frost,
  warm,
  cool,
]

registerAll(FILTERS)
