// Lists — a brand-bulleted ul/li. One html leaf: bullets are inline markup
// chosen by the bullet axis (structural, so build() reads ctx.variants —
// no css patch could swap a glyph).

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { bodyText } from "./util"

const BULLETS: Record<string, string> = {
  dot: "●",
  check: "✓",
  arrow: "→",
}

const DEFS: ComponentDef[] = [
  {
    id: "list",
    name: "Feature List",
    group: "Lists",
    blurb: "brand-bulleted feature list (one line per item)",
    roles: ["meta"],
    tokensUsed: ["--ink", "--accent", "--font-body", "--space"],
    slots: [
      {
        key: "items",
        label: "Items (one per line)",
        sample: "Free shipping\nEasy 30-day returns\n2-year warranty",
      },
    ],
    variants: [
      {
        key: "bullet",
        label: "Bullet",
        def: "check",
        options: [
          { id: "dot", label: "Dot" },
          { id: "check", label: "Check" },
          { id: "arrow", label: "Arrow" },
        ],
      },
    ],
    preview: { w: 820, h: 460 },
    build: ({ content, variants, layout }) => {
      const glyph = BULLETS[variants.bullet] ?? BULLETS.check
      const items = content.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
          (line) =>
            `<li style="display:flex; align-items:baseline; gap:calc(var(--space) * 0.9)"><span style="color:var(--accent); font-weight:800; flex-shrink:0">${glyph}</span><span>${line}</span></li>`
        )
        .join("")
      return node({
        id: "surface",
        role: "meta",
        tag: "div",
        html: `<ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:calc(var(--space) * 0.9)">${items}</ul>`,
        editable: true,
        layout,
        css: {
          ...bodyText,
          fontSize: "32px",
          lineHeight: "1.35",
        },
      })
    },
  },
  {
    id: "list-numbered",
    name: "Numbered List",
    group: "Lists",
    blurb: "steps with oversized editorial numerals",
    roles: ["meta"],
    tokensUsed: ["--ink", "--accent", "--font-body", "--font-heading", "--space"],
    slots: [
      {
        key: "items",
        label: "Items (one per line)",
        sample: "Pick your palette\nDrop in your logo\nExport everywhere",
      },
    ],
    preview: { w: 860, h: 560 },
    build: ({ content, layout }) => {
      const items = content.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
          (line, i) =>
            `<li style="display:flex; align-items:baseline; gap:calc(var(--space) * 1.1)"><span style="font-family:var(--font-heading); font-weight:800; font-size:1.6em; line-height:1; color:var(--accent)">${String(i + 1).padStart(2, "0")}</span><span>${line}</span></li>`
        )
        .join("")
      return node({
        id: "surface",
        role: "meta",
        html: `<ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:calc(var(--space) * 1.1)">${items}</ul>`,
        editable: true,
        layout,
        css: { ...bodyText, fontSize: "32px", lineHeight: "1.3" },
      })
    },
  },
  {
    id: "list-timeline",
    name: "Timeline",
    group: "Lists",
    blurb: "vertical milestones on a connector line",
    roles: ["meta"],
    tokensUsed: ["--ink", "--accent", "--border", "--font-body", "--space"],
    slots: [
      {
        key: "items",
        label: "Items (one per line)",
        sample: "Sketch — day 1\nPrototype — day 3\nLaunch — day 7",
      },
    ],
    preview: { w: 860, h: 560 },
    build: ({ content, layout }) => {
      const items = content.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
          (line) =>
            `<li style="display:flex; align-items:center; gap:calc(var(--space) * 1)"><span style="width:16px; height:16px; border-radius:50%; background:var(--accent); margin-left:-9.5px; flex-shrink:0"></span><span>${line}</span></li>`
        )
        .join("")
      return node({
        id: "surface",
        role: "meta",
        html: `<ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:calc(var(--space) * 1.6); border-left:3px solid var(--border)">${items}</ul>`,
        editable: true,
        layout,
        css: { ...bodyText, fontSize: "30px", lineHeight: "1.3" },
      })
    },
  },
]

registerAll(DEFS)
