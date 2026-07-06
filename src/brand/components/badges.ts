// Badges & Tags — floaters that ride over art: the round promo sticker and
// the pill chip (promoted from the gallery's chipCss).

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { FLOW, flexCenter } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "badge-sticker",
    name: "Promo Sticker",
    group: "Badges & Tags",
    blurb: "round accent sale/promo sticker",
    roles: ["badge"],
    tokensUsed: ["--accent", "--background", "--font-body", "--shadow"],
    slots: [{ key: "label", label: "Label", sample: "-30%" }],
    variants: [
      {
        key: "tilt",
        label: "Tilt",
        def: "tilted",
        part: "label",
        options: [
          { id: "straight", label: "Straight" },
          { id: "tilted", label: "Tilted", css: { rotate: "-8deg" } },
        ],
      },
    ],
    preview: { w: 420, h: 420 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        layout,
        css: {
          ...flexCenter,
          width: "190px",
          height: "190px",
          background: "var(--accent)",
          borderRadius: "50%",
          boxShadow: "var(--shadow)",
        },
        children: [
          node({
            id: "label",
            html: content.label,
            editable: true,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-body)",
              fontWeight: "800",
              fontSize: "48px",
              lineHeight: "1",
              textAlign: "center",
              color: "var(--background)",
            },
          }),
        ],
      }),
  },
  {
    id: "tag",
    name: "Tag Chip",
    group: "Badges & Tags",
    blurb: "translucent pill chip for features/labels",
    roles: ["badge"],
    tokensUsed: [
      "--ink",
      "--border",
      "--accent",
      "--background",
      "--font-body",
      "--space",
    ],
    slots: [{ key: "label", label: "Label", sample: "New in" }],
    variants: [
      {
        key: "tone",
        label: "Tone",
        def: "glass",
        options: [
          {
            id: "glass",
            label: "Glass",
            css: {
              background: "rgba(255,255,255,0.08)",
              color: "var(--ink)",
            },
          },
          {
            id: "accent",
            label: "Accent",
            css: { background: "var(--accent)", color: "var(--background)" },
          },
        ],
      },
    ],
    preview: { w: 560, h: 240 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        html: content.label,
        editable: true,
        layout,
        css: {
          ...flexCenter,
          fontFamily: "var(--font-body)",
          fontSize: "24px",
          fontWeight: "700",
          border: "1px solid var(--border)",
          padding: "calc(var(--space) * 0.75) calc(var(--space) * 1.6)",
          borderRadius: "999px",
          whiteSpace: "nowrap",
        },
      }),
  },
]

registerAll(DEFS)
