// Shared css fragments for component defs. Values are sized for the ~1080px
// design canvas (same scale the gallery scenes use); previews render at native
// size and object-contain scale into their tile.

import type { Layout } from "../../scene/layout"

export const FLOW: Layout = { mode: "flow" }

/** Center a flex box's content. */
export const flexCenter: Record<string, string> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

/** Base copy style — every text component starts from this. */
export const bodyText: Record<string, string> = {
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  margin: "0",
}

/** An elevated card surface built from tokens. */
export const cardSurface: Record<string, string> = {
  display: "flex",
  flexDirection: "column",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  padding: "calc(var(--space) * 2)",
  gap: "calc(var(--space) * 1.25)",
}

/** Placeholder art for image-bearing components when no photo is set. */
export const photoPlaceholder: Record<string, string> = {
  background:
    "linear-gradient(135deg, var(--primary) 0%, var(--accent-2) 60%, var(--accent) 100%)",
}

/** Encode an inline SVG as a css-safe data URI (the sanitizer allows
 *  url(data:image/…); external url() is stripped). */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** THE creative unlock for brand-adaptive artwork: use an arbitrary SVG
 *  silhouette as a mask and let plain CSS (var(--token) gradients/colors)
 *  provide the fill. The shape can be anything; the color stays live-themed —
 *  unlike baking colors into an SVG data URI, which would freeze the brand. */
export function svgMask(svg: string): Record<string, string> {
  const url = svgUrl(svg)
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
  }
}
