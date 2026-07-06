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
