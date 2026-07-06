// Data & Price — the big number and the price tag.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { FLOW, bodyText, flexCenter } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "stat-block",
    name: "Stat Block",
    group: "Data & Price",
    blurb: "oversized metric with a small tracked label",
    roles: ["group", "meta"],
    tokensUsed: ["--primary", "--muted", "--font-heading", "--font-body", "--space"],
    slots: [
      { key: "value", label: "Value", sample: "98%" },
      { key: "label", label: "Label", sample: "Customer satisfaction" },
    ],
    preview: { w: 700, h: 460 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space) * 0.5)",
        },
        children: [
          node({
            id: "value",
            html: content.value,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontFamily: "var(--font-heading)",
              fontSize: "130px",
              fontWeight: "700",
              lineHeight: "1",
              color: "var(--primary)",
            },
          }),
          node({
            id: "label",
            role: "meta",
            html: content.label,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontSize: "26px",
              fontWeight: "700",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
            },
          }),
        ],
      }),
  },
  {
    id: "price-tag",
    name: "Price Tag",
    group: "Data & Price",
    blurb: "price callout — plain, compare-slashed, or accent pill",
    roles: ["price"],
    tokensUsed: [
      "--ink",
      "--accent",
      "--background",
      "--muted",
      "--font-heading",
      "--space",
      "--shadow",
    ],
    slots: [
      { key: "price", label: "Price", sample: "$49" },
      { key: "compare", label: "Compare-at price", sample: "$70" },
    ],
    variants: [
      {
        key: "style",
        label: "Style",
        def: "plain",
        options: [
          { id: "plain", label: "Plain" },
          { id: "slashed", label: "Compare" },
          {
            id: "pill",
            label: "Accent pill",
            css: {
              background: "var(--accent)",
              color: "var(--background)",
              padding: "calc(var(--space) * 1) calc(var(--space) * 2.2)",
              borderRadius: "999px",
              boxShadow: "var(--shadow)",
            },
          },
        ],
      },
    ],
    preview: { w: 640, h: 320 },
    build: ({ content, variants, layout }) => {
      const html =
        variants.style === "slashed"
          ? `<s style="opacity:0.55; font-size:0.6em; font-weight:400; margin-right:calc(var(--space) * 0.75)">${content.compare}</s>${content.price}`
          : content.price
      return node({
        id: "surface",
        role: "price",
        html,
        editable: true,
        layout,
        css: {
          ...flexCenter,
          fontFamily: "var(--font-heading)",
          fontSize: "72px",
          fontWeight: "700",
          lineHeight: "1",
          color: "var(--ink)",
          whiteSpace: "nowrap",
        },
      })
    },
  },
]

registerAll(DEFS)
