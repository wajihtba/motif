// Text — the brand's typographic voice: eyebrow / headline / subhead styles.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { bodyText } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "eyebrow",
    name: "Eyebrow",
    group: "Text",
    blurb: "small tracked kicker line above a headline",
    roles: ["eyebrow"],
    tokensUsed: ["--accent", "--font-body"],
    slots: [{ key: "text", label: "Text", sample: "New collection" }],
    preview: { w: 800, h: 200 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "eyebrow",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...bodyText,
          color: "var(--accent)",
          fontSize: "26px",
          fontWeight: "700",
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        },
      }),
  },
  {
    id: "headline",
    name: "Headline",
    group: "Text",
    blurb: "display headline in the brand heading font",
    roles: ["headline"],
    tokensUsed: ["--ink", "--font-heading"],
    slots: [{ key: "text", label: "Text", sample: "The bold standard" }],
    variants: [
      {
        key: "weight",
        label: "Weight",
        def: "bold",
        options: [
          { id: "regular", label: "Regular", css: { fontWeight: "400" } },
          { id: "bold", label: "Bold", css: { fontWeight: "700" } },
          { id: "black", label: "Black", css: { fontWeight: "900" } },
        ],
      },
      {
        key: "align",
        label: "Align",
        def: "left",
        options: [
          { id: "left", label: "Left", css: { textAlign: "left" } },
          { id: "center", label: "Center", css: { textAlign: "center" } },
        ],
      },
    ],
    preview: { w: 1200, h: 420 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "headline",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...bodyText,
          fontFamily: "var(--font-heading)",
          fontSize: "96px",
          lineHeight: "1.05",
          letterSpacing: "-0.02em",
        },
      }),
  },
  {
    id: "subhead",
    name: "Subhead",
    group: "Text",
    blurb: "supporting copy under a headline",
    roles: ["subhead"],
    tokensUsed: ["--ink", "--font-body"],
    slots: [
      {
        key: "text",
        label: "Text",
        sample: "Crafted for the ones who notice the details.",
      },
    ],
    preview: { w: 1100, h: 260 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "subhead",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...bodyText,
          fontSize: "34px",
          lineHeight: "1.4",
          opacity: "0.85",
        },
      }),
  },
]

registerAll(DEFS)
