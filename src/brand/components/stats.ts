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
  {
    id: "stat-row",
    name: "Stat Row",
    group: "Data & Price",
    blurb: "a row of metrics (value|label per line)",
    roles: ["group", "meta"],
    tokensUsed: [
      "--primary",
      "--ink",
      "--muted",
      "--border",
      "--font-heading",
      "--font-body",
      "--space",
    ],
    slots: [
      {
        key: "items",
        label: "Stats (value|label per line)",
        sample: "98%|Satisfaction\n4.9★|App rating\n2M+|Creators",
      },
    ],
    preview: { w: 1100, h: 380 },
    build: ({ content, layout }) => {
      const cells = content.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [value = "", label = ""] = line.split("|")
          return `<li style="display:flex; flex-direction:column; gap:calc(var(--space) * 0.3); padding:0 calc(var(--space) * 1.8)"><span style="font-family:var(--font-heading); font-weight:700; font-size:2.6em; line-height:1; color:var(--primary)">${value.trim()}</span><span style="font-size:0.75em; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted)">${label.trim()}</span></li>`
        })
        .join(
          `<li aria-hidden="true" style="width:1px; background:var(--border)"></li>`
        )
      return node({
        id: "surface",
        role: "group",
        html: `<ul style="list-style:none; margin:0; padding:0; display:flex; align-items:stretch">${cells}</ul>`,
        editable: true,
        layout,
        css: { ...bodyText, fontSize: "30px" },
      })
    },
  },
  {
    id: "countdown",
    name: "Countdown",
    group: "Data & Price",
    blurb: "urgency timer chips (sale ends in…)",
    roles: ["group", "meta"],
    tokensUsed: [
      "--ink",
      "--muted",
      "--border",
      "--radius",
      "--font-heading",
      "--font-body",
      "--space",
    ],
    slots: [
      { key: "label", label: "Label", sample: "Ends in" },
      { key: "time", label: "Time (d:h:m)", sample: "02:14:36" },
    ],
    preview: { w: 900, h: 320 },
    build: ({ content, layout }) => {
      const units = ["days", "hrs", "min"]
      const chips = content.time
        .split(":")
        .slice(0, 3)
        .map(
          (seg, i) =>
            `<span style="display:flex; flex-direction:column; align-items:center; gap:6px"><span style="display:flex; align-items:center; justify-content:center; min-width:96px; padding:calc(var(--space) * 0.9) calc(var(--space) * 0.7); background:rgba(255,255,255,0.08); border:1px solid var(--border); border-radius:var(--radius); font-family:var(--font-heading); font-weight:700; font-size:1.7em; line-height:1">${seg.trim()}</span><span style="font-size:0.6em; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted)">${units[i] ?? ""}</span></span>`
        )
        .join(
          `<span style="font-family:var(--font-heading); font-size:1.5em; opacity:0.6; padding-top:10px">:</span>`
        )
      return node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space) * 0.8)",
        },
        children: [
          node({
            id: "label",
            role: "meta",
            html: content.label,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontSize: "24px",
              fontWeight: "700",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
            },
          }),
          node({
            id: "chips",
            html: `<span style="display:flex; align-items:flex-start; gap:calc(var(--space) * 0.7)">${chips}</span>`,
            layout: FLOW,
            css: { ...bodyText, fontSize: "34px" },
          }),
        ],
      })
    },
  },
  {
    id: "rating",
    name: "Rating",
    group: "Data & Price",
    blurb: "star rating with a review count",
    roles: ["group", "meta"],
    tokensUsed: ["--accent", "--muted", "--font-body", "--space"],
    slots: [
      { key: "stars", label: "Stars (1-5)", sample: "5" },
      { key: "caption", label: "Caption", sample: "4.9 · 2,300 reviews" },
    ],
    preview: { w: 760, h: 260 },
    build: ({ content, layout }) => {
      const n = Math.max(0, Math.min(5, Math.round(Number(content.stars) || 5)))
      const stars = "★".repeat(n) + "☆".repeat(5 - n)
      return node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--space) * 1)",
        },
        children: [
          node({
            id: "stars",
            html: stars,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-body)",
              fontSize: "44px",
              letterSpacing: "0.08em",
              color: "var(--accent)",
              margin: "0",
              whiteSpace: "nowrap",
            },
          }),
          node({
            id: "caption",
            role: "meta",
            html: content.caption,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontSize: "27px",
              fontWeight: "600",
              color: "var(--muted)",
              whiteSpace: "nowrap",
            },
          }),
        ],
      })
    },
  },
  {
    id: "progress",
    name: "Progress Meter",
    group: "Data & Price",
    blurb: "goal / funding / capacity meter with a label",
    roles: ["group", "meta"],
    tokensUsed: [
      "--primary",
      "--accent-2",
      "--ink",
      "--muted",
      "--font-body",
      "--space",
    ],
    slots: [
      { key: "label", label: "Label", sample: "Spots filled" },
      { key: "percent", label: "Percent (0-100)", sample: "72" },
    ],
    preview: { w: 900, h: 280 },
    build: ({ content, layout }) => {
      const pct = Math.max(0, Math.min(100, Number(content.percent) || 0))
      return node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space) * 0.7)",
          width: "560px",
        },
        children: [
          node({
            id: "label",
            role: "meta",
            html: `<span style="display:flex; justify-content:space-between"><span>${content.label}</span><span style="color:var(--ink); font-weight:800">${pct}%</span></span>`,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontSize: "26px",
              fontWeight: "700",
              color: "var(--muted)",
            },
          }),
          node({
            id: "track",
            layout: FLOW,
            css: {
              height: "22px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              overflow: "hidden",
            },
            children: [
              node({
                id: "fill",
                layout: FLOW,
                css: {
                  width: `${pct}%`,
                  height: "100%",
                  borderRadius: "999px",
                  backgroundImage:
                    "linear-gradient(90deg, var(--primary), var(--accent-2))",
                },
              }),
            ],
          }),
        ],
      })
    },
  },
]

registerAll(DEFS)
