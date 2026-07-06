// Text — the brand's typographic voice: eyebrow / headline / subhead styles.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { FLOW, bodyText } from "./util"

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
  {
    id: "headline-gradient",
    name: "Gradient Headline",
    group: "Text",
    blurb: "display headline filled with the brand gradient",
    roles: ["headline"],
    tokensUsed: ["--primary", "--accent-2", "--font-heading"],
    slots: [{ key: "text", label: "Text", sample: "Future proof" }],
    preview: { w: 1200, h: 380 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "headline",
        html: content.text,
        editable: true,
        layout,
        css: {
          fontFamily: "var(--font-heading)",
          fontSize: "110px",
          fontWeight: "800",
          lineHeight: "1.05",
          letterSpacing: "-0.02em",
          margin: "0",
          backgroundImage:
            "linear-gradient(100deg, var(--primary), var(--accent-2))",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        },
      }),
  },
  {
    id: "headline-outline",
    name: "Outline Headline",
    group: "Text",
    blurb: "hollow stroked display type — bold editorial statement",
    roles: ["headline"],
    tokensUsed: ["--ink", "--font-heading"],
    slots: [{ key: "text", label: "Text", sample: "OVERSIZE" }],
    preview: { w: 1200, h: 380 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "headline",
        html: content.text,
        editable: true,
        layout,
        css: {
          fontFamily: "var(--font-heading)",
          fontSize: "120px",
          fontWeight: "800",
          lineHeight: "1",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          margin: "0",
          color: "transparent",
          WebkitTextStroke: "3px var(--ink)",
        },
      }),
  },
  {
    id: "headline-highlight",
    name: "Highlighted Headline",
    group: "Text",
    blurb: "headline with a marker swipe behind the words",
    roles: ["headline"],
    tokensUsed: ["--ink", "--accent", "--font-heading"],
    slots: [{ key: "text", label: "Text", sample: "Half price today" }],
    preview: { w: 1200, h: 380 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "headline",
        html: `<span style="background:linear-gradient(180deg, transparent 58%, var(--accent) 58%); padding:0 0.12em">${content.text}</span>`,
        editable: true,
        layout,
        css: {
          fontFamily: "var(--font-heading)",
          fontSize: "88px",
          fontWeight: "700",
          lineHeight: "1.25",
          letterSpacing: "-0.01em",
          margin: "0",
          color: "var(--ink)",
        },
      }),
  },
  {
    id: "quote-pull",
    name: "Pull Quote",
    group: "Text",
    blurb: "oversized accent quote mark with a short line",
    roles: ["group", "subhead"],
    tokensUsed: ["--ink", "--accent", "--font-heading", "--space"],
    slots: [
      { key: "quote", label: "Quote", sample: "Made to be noticed." },
    ],
    preview: { w: 900, h: 460 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space) * 0.25)",
        },
        children: [
          node({
            id: "mark",
            html: "“",
            layout: FLOW,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "160px",
              lineHeight: "0.55",
              color: "var(--accent)",
              margin: "0",
            },
          }),
          node({
            id: "quote",
            role: "subhead",
            html: content.quote,
            editable: true,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "54px",
              fontStyle: "italic",
              lineHeight: "1.25",
              color: "var(--ink)",
              margin: "0",
            },
          }),
        ],
      }),
  },
  {
    id: "caption-meta",
    name: "Meta Caption",
    group: "Text",
    blurb: "small dotted meta line (date · author · category)",
    roles: ["meta"],
    tokensUsed: ["--muted", "--font-body"],
    slots: [
      {
        key: "text",
        label: "Text",
        sample: "June 2026 · Studio Notes · 4 min",
      },
    ],
    preview: { w: 900, h: 180 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "meta",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...bodyText,
          fontSize: "24px",
          fontWeight: "600",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          whiteSpace: "nowrap",
        },
      }),
  },
  {
    id: "text-vertical",
    name: "Vertical Label",
    group: "Text",
    blurb: "rotated side label running down the edge of the canvas",
    roles: ["meta"],
    tokensUsed: ["--muted", "--font-body"],
    slots: [{ key: "text", label: "Text", sample: "EST. 2026 — PARIS" }],
    preview: { w: 260, h: 720 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "meta",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...bodyText,
          writingMode: "vertical-rl",
          fontSize: "26px",
          fontWeight: "700",
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: "var(--muted)",
          whiteSpace: "nowrap",
        },
      }),
  },
  {
    id: "kicker-number",
    name: "Editorial Number",
    group: "Text",
    blurb: "oversized section numeral with a small label",
    roles: ["group", "meta"],
    tokensUsed: ["--accent", "--muted", "--font-heading", "--font-body", "--space"],
    slots: [
      { key: "number", label: "Number", sample: "01" },
      { key: "label", label: "Label", sample: "The process" },
    ],
    variants: [
      {
        key: "fill",
        label: "Fill",
        def: "solid",
        part: "number",
        options: [
          { id: "solid", label: "Solid" },
          {
            id: "outline",
            label: "Outline",
            css: {
              color: "transparent",
              WebkitTextStroke: "3px var(--accent)",
            },
          },
        ],
      },
    ],
    preview: { w: 700, h: 480 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: {
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space) * 0.4)",
        },
        children: [
          node({
            id: "number",
            html: content.number,
            editable: true,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "170px",
              fontWeight: "800",
              lineHeight: "0.85",
              color: "var(--accent)",
              margin: "0",
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
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--muted)",
            },
          }),
        ],
      }),
  },
]

registerAll(DEFS)
