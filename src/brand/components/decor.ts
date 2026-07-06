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
            id: "arch",
            label: "Arch",
            css: {
              borderRadius: "999px 999px var(--radius) var(--radius)",
            },
          },
          {
            id: "blob",
            label: "Blob",
            css: {
              borderRadius: "58% 42% 55% 45% / 55% 48% 38% 52%",
              outline: "none",
            },
          },
          {
            id: "hex",
            label: "Hexagon",
            css: {
              clipPath:
                "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
              outline: "none",
              boxShadow: "none",
            },
          },
          {
            id: "tilt",
            label: "Tilted",
            css: { borderRadius: "var(--radius)", rotate: "-4deg" },
          },
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
  {
    id: "accent-shape",
    name: "Accent Shape",
    group: "Decor & Frames",
    blurb: "abstract brand shape — blob, ring, beam, or dot grid",
    roles: [],
    tokensUsed: ["--primary", "--accent", "--accent-2"],
    slots: [],
    variants: [
      {
        key: "shape",
        label: "Shape",
        def: "blob",
        options: [
          {
            id: "blob",
            label: "Blob",
            css: {
              borderRadius: "58% 42% 55% 45% / 55% 48% 38% 52%",
              backgroundImage:
                "linear-gradient(135deg, var(--primary), var(--accent-2))",
            },
          },
          {
            id: "ring",
            label: "Ring",
            css: {
              borderRadius: "50%",
              border: "28px solid var(--accent)",
              background: "transparent",
            },
          },
          {
            id: "beam",
            label: "Beam",
            css: {
              height: "90px",
              borderRadius: "999px",
              backgroundImage:
                "linear-gradient(90deg, var(--primary), var(--accent-2))",
              rotate: "-24deg",
            },
          },
          {
            id: "dots",
            label: "Dot grid",
            css: {
              backgroundImage:
                "radial-gradient(var(--accent) 4px, transparent 4px)",
              backgroundSize: "30px 30px",
              opacity: "0.9",
            },
          },
        ],
      },
    ],
    preview: { w: 520, h: 520 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: { width: "340px", height: "340px" },
      }),
  },
  {
    id: "pattern-block",
    name: "Pattern Block",
    group: "Decor & Frames",
    blurb: "tiled brand pattern — stripes, dots, checker, or grid",
    roles: [],
    tokensUsed: ["--primary", "--accent"],
    slots: [],
    variants: [
      {
        key: "pattern",
        label: "Pattern",
        def: "stripes",
        options: [
          {
            id: "stripes",
            label: "Stripes",
            css: {
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--primary) 0 18px, transparent 18px 44px)",
            },
          },
          {
            id: "dots",
            label: "Dots",
            css: {
              backgroundImage:
                "radial-gradient(var(--primary) 5px, transparent 5px)",
              backgroundSize: "36px 36px",
            },
          },
          {
            id: "checker",
            label: "Checker",
            css: {
              backgroundImage:
                "conic-gradient(var(--primary) 25%, transparent 0 50%, var(--primary) 0 75%, transparent 0)",
              backgroundSize: "64px 64px",
            },
          },
          {
            id: "grid",
            label: "Grid",
            css: {
              backgroundImage:
                "linear-gradient(var(--accent) 2px, transparent 2px), linear-gradient(90deg, var(--accent) 2px, transparent 2px)",
              backgroundSize: "48px 48px",
              opacity: "0.55",
            },
          },
        ],
      },
    ],
    preview: { w: 560, h: 420 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: { width: "420px", height: "300px", opacity: "0.85" },
      }),
  },
  {
    id: "photo-stack",
    name: "Photo Stack",
    group: "Decor & Frames",
    blurb: "two casually stacked photo frames",
    roles: ["group", "image"],
    tokensUsed: ["--primary", "--accent", "--accent-2", "--shadow"],
    slots: [],
    preview: { w: 680, h: 680 },
    build: ({ layout, image }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        allowOverlap: true,
        css: { width: "440px", height: "440px" },
        children: [
          node({
            id: "back",
            layout: {
              mode: "absolute",
              anchor: "center",
              dx: 0.05,
              dy: -0.04,
              width: 0.82,
              height: 0.82,
            },
            css: {
              backgroundImage:
                "linear-gradient(315deg, var(--accent) 0%, var(--accent-2) 100%)",
              border: "12px solid #fdfcf8",
              rotate: "7deg",
              boxShadow: "var(--shadow)",
              opacity: "0.9",
            },
          }),
          node({
            id: "front",
            role: "image",
            image,
            imageFit: "cover",
            layout: {
              mode: "absolute",
              anchor: "center",
              dx: -0.04,
              dy: 0.03,
              width: 0.85,
              height: 0.85,
            },
            css: {
              border: "12px solid #fdfcf8",
              rotate: "-4deg",
              boxShadow: "var(--shadow)",
              ...(image ? {} : photoPlaceholder),
            },
          }),
        ],
      }),
  },
  {
    id: "washi-tape",
    name: "Tape Strip",
    group: "Decor & Frames",
    blurb: "translucent tape piece to pin photos and notes",
    roles: [],
    tokensUsed: ["--accent"],
    slots: [],
    variants: [
      {
        key: "angle",
        label: "Angle",
        def: "left",
        options: [
          { id: "left", label: "Lean left", css: { rotate: "-7deg" } },
          { id: "right", label: "Lean right", css: { rotate: "6deg" } },
          { id: "flat", label: "Flat" },
        ],
      },
    ],
    preview: { w: 520, h: 260 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          width: "280px",
          height: "62px",
          background: "var(--accent)",
          opacity: "0.7",
          boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          clipPath:
            "polygon(2% 0%, 98% 4%, 100% 96%, 0% 100%)",
        },
      }),
  },
  {
    id: "frame-border",
    name: "Canvas Frame",
    group: "Decor & Frames",
    blurb: "full-canvas keyline border — instant editorial polish",
    roles: [],
    tokensUsed: ["--ink", "--accent"],
    slots: [],
    variants: [
      {
        key: "style",
        label: "Style",
        def: "thin",
        options: [
          { id: "thin", label: "Thin", css: { border: "3px solid var(--ink)" } },
          {
            id: "thick",
            label: "Thick",
            css: { border: "14px solid var(--ink)" },
          },
          {
            id: "double",
            label: "Double",
            css: {
              border: "3px solid var(--ink)",
              outline: "3px solid var(--ink)",
              outlineOffset: "-16px",
            },
          },
          {
            id: "accent",
            label: "Accent",
            css: { border: "6px solid var(--accent)" },
          },
        ],
      },
    ],
    preview: { w: 700, h: 700 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        locked: true,
        css: {
          width: "92%",
          height: "92%",
          pointerEvents: "none",
        },
      }),
  },
  {
    id: "gradient-panel",
    name: "Gradient Panel",
    group: "Decor & Frames",
    blurb: "soft brand-gradient backdrop panel for content",
    roles: [],
    tokensUsed: ["--primary", "--accent-2", "--radius"],
    slots: [],
    variants: [
      {
        key: "style",
        label: "Style",
        def: "linear",
        options: [
          {
            id: "linear",
            label: "Linear",
            css: {
              backgroundImage:
                "linear-gradient(135deg, var(--primary), var(--accent-2))",
            },
          },
          {
            id: "radial",
            label: "Radial",
            css: {
              backgroundImage:
                "radial-gradient(circle at 30% 20%, var(--accent-2), var(--primary) 75%)",
            },
          },
          {
            id: "glow",
            label: "Glow",
            css: {
              backgroundImage:
                "linear-gradient(135deg, var(--primary), var(--accent-2))",
              boxShadow: "0 0 140px 20px var(--primary)",
            },
          },
        ],
      },
    ],
    preview: { w: 820, h: 560 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          width: "560px",
          height: "360px",
          borderRadius: "var(--radius)",
        },
      }),
  },
]

registerAll(DEFS)
