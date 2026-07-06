// Decor & Frames — the divider rule and the photo frame.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { photoPlaceholder } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "divider",
    name: "Divider",
    group: "Decor & Frames",
    blurb: "horizontal brand rule",
    roles: [],
    tokensUsed: ["--primary", "--accent"],
    slots: [],
    variants: [
      {
        key: "style",
        label: "Style",
        def: "solid",
        options: [
          { id: "solid", label: "Solid", css: { background: "var(--primary)" } },
          {
            id: "gradient",
            label: "Gradient",
            css: {
              background:
                "linear-gradient(90deg, var(--primary), var(--accent))",
            },
          },
          {
            id: "dotted",
            label: "Dotted",
            css: {
              background:
                "repeating-linear-gradient(90deg, var(--primary) 0 10px, transparent 10px 24px)",
            },
          },
        ],
      },
    ],
    preview: { w: 900, h: 160 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        css: {
          width: "420px",
          height: "6px",
          borderRadius: "999px",
        },
      }),
  },
  {
    id: "image-frame",
    name: "Image Frame",
    group: "Decor & Frames",
    blurb: "branded photo container — rounded, circle, or polaroid",
    roles: ["image"],
    tokensUsed: [
      "--radius",
      "--border",
      "--shadow",
      "--primary",
      "--accent",
      "--accent-2",
    ],
    slots: [],
    variants: [
      {
        key: "frame",
        label: "Frame",
        def: "rounded",
        options: [
          {
            id: "rounded",
            label: "Rounded",
            css: { borderRadius: "var(--radius)" },
          },
          { id: "circle", label: "Circle", css: { borderRadius: "50%" } },
          {
            id: "polaroid",
            label: "Polaroid",
            css: {
              borderRadius: "6px",
              border: "18px solid #ffffff",
              borderBottomWidth: "64px",
            },
          },
        ],
      },
    ],
    preview: { w: 620, h: 620 },
    build: ({ layout, image }) =>
      node({
        id: "surface",
        role: "image",
        image,
        imageFit: "cover",
        layout,
        css: {
          width: "440px",
          height: "440px",
          overflow: "hidden",
          boxShadow: "var(--shadow)",
          outline: "1px solid var(--border)",
          ...(image ? {} : photoPlaceholder),
        },
      }),
  },
]

registerAll(DEFS)
