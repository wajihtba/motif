// Logo — the brand mark as a placeable element. Uses the brand's uploaded
// logo asset when present; falls back to a monogram placeholder so the tile
// still previews without one.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { FLOW, flexCenter } from "./util"

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
  {
    id: "logo-lockup",
    name: "Logo Lockup",
    group: "Logo",
    blurb: "brand mark beside the brand name",
    roles: ["group"],
    tokensUsed: ["--ink", "--border", "--font-heading", "--space"],
    slots: [{ key: "name", label: "Brand name", sample: "Acme Studio" }],
    preview: { w: 900, h: 300 },
    build: ({ content, layout, logo }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--space) * 1.2)",
        },
        children: [
          logo
            ? node({
                id: "mark",
                image: logo,
                imageFit: "contain",
                layout: FLOW,
                css: { width: "96px", height: "96px" },
              })
            : node({
                id: "mark",
                html: "M",
                layout: FLOW,
                css: {
                  ...flexCenter,
                  width: "88px",
                  height: "88px",
                  border: "3px solid var(--border)",
                  borderRadius: "50%",
                  fontFamily: "var(--font-heading)",
                  fontSize: "46px",
                  fontWeight: "700",
                  color: "var(--ink)",
                },
              }),
          node({
            id: "name",
            html: content.name,
            editable: true,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "54px",
              fontWeight: "700",
              color: "var(--ink)",
              whiteSpace: "nowrap",
              margin: "0",
            },
          }),
        ],
      }),
  },
  {
    id: "watermark",
    name: "Watermark",
    group: "Logo",
    blurb: "faint brand mark for corners (place bottom-right)",
    roles: [],
    tokensUsed: ["--ink", "--font-heading"],
    slots: [{ key: "text", label: "Fallback text", sample: "acme.co" }],
    preview: { w: 480, h: 280 },
    build: ({ content, layout, logo }) =>
      logo
        ? node({
            id: "surface",
            image: logo,
            imageFit: "contain",
            layout,
            allowOverlap: true,
            css: { width: "110px", height: "110px", opacity: "0.4" },
          })
        : node({
            id: "surface",
            html: content.text,
            editable: true,
            layout,
            allowOverlap: true,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "30px",
              fontWeight: "700",
              letterSpacing: "0.14em",
              color: "var(--ink)",
              opacity: "0.4",
              whiteSpace: "nowrap",
              margin: "0",
            },
          }),
  },
]

registerAll(DEFS)
