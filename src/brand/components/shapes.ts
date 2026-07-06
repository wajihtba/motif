// Shapes — artistic SVG silhouettes as brand-colored building blocks. Every
// shape is an SVG data-URI *mask* over a plain CSS fill (svgMask in util.ts),
// so the silhouette can be any path while the color stays var(--token)-driven
// and re-themes live. All decorative: allowOverlap, no roles.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef, VariantAxis } from "./types"
import { svgMask } from "./util"

const SVG = (vb: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${body}</svg>`

// Silhouettes are white-on-transparent; the mask reads alpha only.
const WAVE = SVG(
  "0 0 360 140",
  `<path d="M0 70 Q 45 10 90 55 T 180 60 Q 225 15 270 55 T 360 60 V 140 H 0 Z" fill="#fff"/>`
)
const SCRIBBLE = SVG(
  "0 0 320 90",
  `<path d="M12 62 Q 60 18 108 48 T 200 44 T 308 40 M28 76 Q 90 44 150 62 T 296 56" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/>`
)
const SPARKLE = SVG(
  "0 0 200 200",
  `<path d="M100 0 C 106 58 142 94 200 100 C 142 106 106 142 100 200 C 94 142 58 106 0 100 C 58 94 94 58 100 0 Z" fill="#fff"/>`
)
const ARROW = SVG(
  "0 0 300 160",
  `<path d="M18 132 C 70 40 190 24 262 62" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M262 62 L 216 48 M262 62 L 244 106" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`
)
const SPLAT = SVG(
  "0 0 220 220",
  `<path d="M110 16 C 146 8 186 34 196 72 C 206 108 214 128 196 152 C 178 176 148 206 110 200 C 74 194 52 180 34 150 C 16 120 20 84 40 58 C 60 32 78 22 110 16 Z" fill="#fff"/><circle cx="196" cy="34" r="14" fill="#fff"/><circle cx="28" cy="186" r="10" fill="#fff"/><circle cx="204" cy="192" r="8" fill="#fff"/>`
)

const fillAxis: VariantAxis = {
  key: "fill",
  label: "Fill",
  def: "accent",
  options: [
    { id: "accent", label: "Accent", css: { background: "var(--accent)" } },
    { id: "primary", label: "Primary", css: { background: "var(--primary)" } },
    {
      id: "gradient",
      label: "Gradient",
      css: {
        background: "transparent",
        backgroundImage:
          "linear-gradient(120deg, var(--primary), var(--accent-2))",
      },
    },
    { id: "ink", label: "Ink", css: { background: "var(--ink)" } },
  ],
}

const SHAPE_TOKENS = ["--accent", "--primary", "--accent-2", "--ink"]

function shapeDef(
  id: string,
  name: string,
  blurb: string,
  mask: string,
  size: { w: number; h: number },
  preview: { w: number; h: number }
): ComponentDef {
  return {
    id,
    name,
    group: "Shapes",
    blurb,
    roles: [],
    tokensUsed: SHAPE_TOKENS,
    slots: [],
    variants: [fillAxis],
    preview,
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          width: `${size.w}px`,
          height: `${size.h}px`,
          ...svgMask(mask),
        },
      }),
  }
}

const DEFS: ComponentDef[] = [
  shapeDef(
    "shape-wave",
    "Wave Band",
    "flowing wave band — section divider or bottom dress-up",
    WAVE,
    { w: 720, h: 220 },
    { w: 900, h: 320 }
  ),
  shapeDef(
    "shape-scribble",
    "Scribble",
    "hand-drawn marker scribble — energy under a headline",
    SCRIBBLE,
    { w: 460, h: 130 },
    { w: 720, h: 280 }
  ),
  shapeDef(
    "shape-sparkle",
    "Sparkle",
    "four-point sparkle — scatter a few for magic",
    SPARKLE,
    { w: 180, h: 180 },
    { w: 420, h: 420 }
  ),
  shapeDef(
    "shape-arrow",
    "Doodle Arrow",
    "hand-drawn curved arrow pointing at the thing that matters",
    ARROW,
    { w: 380, h: 210 },
    { w: 640, h: 400 }
  ),
  shapeDef(
    "shape-splat",
    "Ink Splat",
    "organic paint splat backdrop for prices and stickers",
    SPLAT,
    { w: 320, h: 320 },
    { w: 520, h: 520 }
  ),
  {
    id: "shape-rays",
    name: "Sunburst",
    group: "Shapes",
    blurb: "radiating rays disc — put a sticker or price on top",
    roles: [],
    tokensUsed: SHAPE_TOKENS,
    slots: [],
    // Rays paint with currentColor (conic stripes), so this axis drives
    // `color` rather than `background`.
    variants: [
      {
        key: "fill",
        label: "Fill",
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
    ],
    preview: { w: 520, h: 520 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          width: "360px",
          height: "360px",
          borderRadius: "50%",
          // Conic ray stripes; the radial mask fades them toward the rim.
          maskImage:
            "radial-gradient(circle, black 0%, black 55%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(circle, black 0%, black 55%, transparent 72%)",
          backgroundImage:
            "repeating-conic-gradient(from 0deg, currentColor 0deg 7deg, transparent 7deg 20deg)",
        },
      }),
  },
]

registerAll(DEFS)
