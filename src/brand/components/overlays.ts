// Overlays & FX — CSS/SVG texture layers that sit ON TOP of a design:
// film grain (SVG feTurbulence data URI), scanlines, halftone fades, light
// leaks, bokeh, glow orbs. These are static paint (they export in the image
// path with zero engine work); for animated equivalents the effects engine
// (fx.add: grain, chroma, …) is the right tool — these compose with it.
//
// All full-bleed defs size to 100% of the parent; place them last so they
// paint over the content, and keep opacities low.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { svgUrl } from "./util"

const full: Record<string, string> = { width: "100%", height: "100%" }

// Monochrome fractal noise; alpha carries the texture so it tints nothing.
const NOISE = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>`
)

const DEFS: ComponentDef[] = [
  {
    id: "fx-grain",
    name: "Film Grain",
    group: "Overlays & FX",
    blurb: "static photographic grain wash (SVG turbulence)",
    roles: ["grain"],
    tokensUsed: [],
    slots: [],
    variants: [
      {
        key: "amount",
        label: "Amount",
        def: "subtle",
        options: [
          { id: "subtle", label: "Subtle", css: { opacity: "0.14" } },
          { id: "medium", label: "Medium", css: { opacity: "0.26" } },
          { id: "heavy", label: "Heavy", css: { opacity: "0.4" } },
        ],
      },
    ],
    preview: { w: 700, h: 700 },
    build: ({ layout }) =>
      node({
        id: "surface",
        role: "grain",
        layout,
        allowOverlap: true,
        locked: true,
        css: {
          ...full,
          backgroundImage: NOISE,
          backgroundRepeat: "repeat",
          pointerEvents: "none",
        },
      }),
  },
  {
    id: "fx-scanlines",
    name: "Scanlines",
    group: "Overlays & FX",
    blurb: "retro CRT line texture",
    roles: ["grain"],
    tokensUsed: [],
    slots: [],
    preview: { w: 700, h: 700 },
    build: ({ layout }) =>
      node({
        id: "surface",
        role: "grain",
        layout,
        allowOverlap: true,
        locked: true,
        css: {
          ...full,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.55) 0 2px, transparent 2px 6px)",
          opacity: "0.3",
          pointerEvents: "none",
        },
      }),
  },
  {
    id: "fx-halftone",
    name: "Halftone Fade",
    group: "Overlays & FX",
    blurb: "comic halftone dots dissolving across the frame",
    roles: [],
    tokensUsed: ["--accent", "--primary", "--ink"],
    slots: [],
    variants: [
      {
        key: "color",
        label: "Color",
        def: "accent",
        options: [
          { id: "accent", label: "Accent", css: { color: "var(--accent)" } },
          {
            id: "primary",
            label: "Primary",
            css: { color: "var(--primary)" },
          },
          { id: "ink", label: "Ink", css: { color: "var(--ink)" } },
        ],
      },
      {
        key: "side",
        label: "Fade",
        def: "left",
        options: [
          {
            id: "left",
            label: "From left",
            css: {
              maskImage:
                "linear-gradient(to right, black, rgba(0,0,0,0.4) 45%, transparent 80%)",
              WebkitMaskImage:
                "linear-gradient(to right, black, rgba(0,0,0,0.4) 45%, transparent 80%)",
            },
          },
          {
            id: "bottom",
            label: "From bottom",
            css: {
              maskImage:
                "linear-gradient(to top, black, rgba(0,0,0,0.4) 45%, transparent 80%)",
              WebkitMaskImage:
                "linear-gradient(to top, black, rgba(0,0,0,0.4) 45%, transparent 80%)",
            },
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
        css: {
          ...full,
          backgroundImage:
            "radial-gradient(currentColor 4.5px, transparent 4.5px)",
          backgroundSize: "34px 34px",
          opacity: "0.65",
          pointerEvents: "none",
        },
      }),
  },
  {
    id: "fx-light-leak",
    name: "Light Leak",
    group: "Overlays & FX",
    blurb: "warm analog light bleeding in from an edge",
    roles: [],
    tokensUsed: ["--accent", "--accent-2"],
    slots: [],
    variants: [
      {
        key: "edge",
        label: "Edge",
        def: "right",
        options: [
          {
            id: "right",
            label: "Right",
            css: {
              backgroundImage:
                "radial-gradient(70% 90% at 105% 30%, var(--accent), transparent 65%), radial-gradient(50% 60% at 98% 70%, var(--accent-2), transparent 60%)",
            },
          },
          {
            id: "top",
            label: "Top",
            css: {
              backgroundImage:
                "radial-gradient(90% 70% at 30% -8%, var(--accent), transparent 65%), radial-gradient(60% 50% at 75% -5%, var(--accent-2), transparent 60%)",
            },
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
        css: { ...full, opacity: "0.55", pointerEvents: "none" },
      }),
  },
  {
    id: "fx-bokeh",
    name: "Bokeh",
    group: "Overlays & FX",
    blurb: "scattered out-of-focus light circles",
    roles: ["group"],
    tokensUsed: ["--primary", "--accent", "--accent-2"],
    slots: [],
    preview: { w: 700, h: 700 },
    build: ({ layout }) => {
      const dots: Array<[number, number, number, string, number]> = [
        [0.1, 0.18, 90, "var(--accent)", 0.5],
        [0.82, 0.12, 130, "var(--primary)", 0.4],
        [0.68, 0.78, 110, "var(--accent-2)", 0.45],
        [0.24, 0.72, 70, "var(--accent)", 0.35],
        [0.9, 0.5, 60, "var(--accent-2)", 0.4],
        [0.45, 0.08, 55, "var(--primary)", 0.3],
      ]
      return node({
        id: "surface",
        role: "group",
        layout,
        allowOverlap: true,
        locked: true,
        css: { ...full, overflow: "hidden", pointerEvents: "none" },
        children: dots.map(([x, y, size, color, opacity], i) =>
          node({
            id: `dot${i}`,
            layout: {
              mode: "absolute",
              anchor: "top-left",
              dx: x,
              dy: y,
              width: "auto",
              height: "auto",
            },
            css: {
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: "50%",
              background: color,
              opacity: String(opacity),
              filter: `blur(${Math.round(size / 7)}px)`,
            },
          })
        ),
      })
    },
  },
  {
    id: "fx-glow-orb",
    name: "Glow Orb",
    group: "Overlays & FX",
    blurb: "single luminous sphere — place behind a product or headline",
    roles: [],
    tokensUsed: ["--primary", "--accent"],
    slots: [],
    variants: [
      {
        key: "color",
        label: "Color",
        def: "primary",
        options: [
          {
            id: "primary",
            label: "Primary",
            css: {
              backgroundImage:
                "radial-gradient(circle, var(--primary), transparent 70%)",
            },
          },
          {
            id: "accent",
            label: "Accent",
            css: {
              backgroundImage:
                "radial-gradient(circle, var(--accent), transparent 70%)",
            },
          },
        ],
      },
    ],
    preview: { w: 600, h: 600 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          width: "460px",
          height: "460px",
          opacity: "0.8",
          pointerEvents: "none",
        },
      }),
  },
]

registerAll(DEFS)
