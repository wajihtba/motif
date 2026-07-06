// Compact one-line digest of the document's brand snapshot for the agent's
// per-turn context block. Small on purpose: tokens that differ from the
// default theme, voice/logo, motion prefs, and per-component overrides.

import type { BrandSnapshot } from "./types"
import { DEFAULT_THEME } from "../scene/theme"

export function brandDigest(snap: BrandSnapshot): string {
  const tokens = Object.entries(snap.tokens)
    .filter(([k, v]) => DEFAULT_THEME.tokens[k] !== v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const motion = [
    snap.motion.entrance && `entrance=${snap.motion.entrance}`,
    snap.motion.pace && `pace=${snap.motion.pace}`,
    snap.motion.ambient && `ambient=${snap.motion.ambient}`,
    snap.motion.stagger != null && `stagger=${snap.motion.stagger}s`,
    snap.motion.emphasis && `emphasis=${snap.motion.emphasis}`,
  ]
    .filter(Boolean)
    .join(" ")

  const components = Object.entries(snap.components)
    .map(([id, o]) => {
      const bits = [
        ...Object.entries(o.variants ?? {}).map(([k, v]) => `${k}=${v}`),
        o.css && Object.keys(o.css).length
          ? `css:${Object.entries(o.css)
              .map(([k, v]) => `${k}=${v}`)
              .join(",")}`
          : null,
        o.hidden ? "hidden — do not use" : null,
      ].filter(Boolean)
      return `${id}(${bits.join(" ") || "default"})`
    })
    .join(", ")

  return [
    tokens && `tokens: ${tokens}`,
    snap.voice && `voice: ${snap.voice}`,
    snap.logo && `logo: ${snap.logo}`,
    motion && `motion: ${motion}`,
    components && `component overrides: ${components}`,
  ]
    .filter(Boolean)
    .join(" · ")
}
