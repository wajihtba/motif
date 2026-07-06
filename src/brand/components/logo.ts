// Logo — the brand mark as a placeable element. Uses the brand's uploaded
// logo asset when present; falls back to a monogram placeholder so the tile
// still previews without one.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { flexCenter } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "logo-mark",
    name: "Logo Mark",
    group: "Logo",
    blurb: "the brand logo (uses the uploaded brand asset)",
    roles: [],
    tokensUsed: ["--ink", "--border", "--font-heading"],
    slots: [],
    preview: { w: 480, h: 480 },
    build: ({ layout, logo }) =>
      logo
        ? node({
            id: "surface",
            image: logo,
            imageFit: "contain",
            layout,
            css: { width: "260px", height: "260px" },
          })
        : node({
            id: "surface",
            html: "M",
            layout,
            css: {
              ...flexCenter,
              width: "220px",
              height: "220px",
              border: "3px solid var(--border)",
              borderRadius: "50%",
              fontFamily: "var(--font-heading)",
              fontSize: "110px",
              fontWeight: "700",
              color: "var(--ink)",
            },
          }),
  },
]

registerAll(DEFS)
