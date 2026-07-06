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
  {
    id: "ribbon-corner",
    name: "Corner Ribbon",
    group: "Badges & Tags",
    blurb: "diagonal ribbon strip for corners (place over the top corner)",
    roles: ["badge"],
    tokensUsed: [
      "--primary",
      "--primary-foreground",
      "--font-body",
      "--space",
      "--shadow",
    ],
    slots: [{ key: "label", label: "Label", sample: "Best seller" }],
    preview: { w: 520, h: 400 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        html: content.label,
        editable: true,
        layout,
        allowOverlap: true,
        css: {
          ...flexCenter,
          width: "380px",
          padding: "calc(var(--space) * 0.6) 0",
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          fontFamily: "var(--font-body)",
          fontWeight: "800",
          fontSize: "24px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          boxShadow: "var(--shadow)",
          rotate: "-35deg",
        },
      }),
  },
  {
    id: "banner-strip",
    name: "Announcement Bar",
    group: "Badges & Tags",
    blurb: "full-width announcement strip (top or bottom of the canvas)",
    roles: ["badge"],
    tokensUsed: [
      "--primary",
      "--primary-foreground",
      "--accent",
      "--background",
      "--ink",
      "--font-body",
      "--space",
    ],
    slots: [
      {
        key: "text",
        label: "Text",
        sample: "Free shipping on orders over $50 →",
      },
    ],
    variants: [
      {
        key: "tone",
        label: "Tone",
        def: "primary",
        options: [
          {
            id: "primary",
            label: "Primary",
            css: {
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            },
          },
          {
            id: "accent",
            label: "Accent",
            css: { background: "var(--accent)", color: "var(--background)" },
          },
          {
            id: "glass",
            label: "Glass",
            css: {
              background: "rgba(255,255,255,0.1)",
              color: "var(--ink)",
            },
          },
        ],
      },
    ],
    preview: { w: 1200, h: 200 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        html: content.text,
        editable: true,
        layout,
        css: {
          ...flexCenter,
          width: "100%",
          padding: "calc(var(--space) * 0.9) var(--space)",
          fontFamily: "var(--font-body)",
          fontWeight: "700",
          fontSize: "26px",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        },
      }),
  },
  {
    id: "starburst",
    name: "Starburst",
    group: "Badges & Tags",
    blurb: "retail starburst seal for prices and promos",
    roles: ["badge"],
    tokensUsed: ["--accent", "--background", "--font-body"],
    slots: [{ key: "label", label: "Label", sample: "50% OFF" }],
    preview: { w: 460, h: 460 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        layout,
        allowOverlap: true,
        css: {
          ...flexCenter,
          width: "260px",
          height: "260px",
          background: "var(--accent)",
          clipPath:
            "polygon(50% 0%, 59% 12%, 72% 5%, 76% 19%, 91% 17%, 89% 32%, 100% 38%, 92% 50%, 100% 62%, 89% 68%, 91% 83%, 76% 81%, 72% 95%, 59% 88%, 50% 100%, 41% 88%, 28% 95%, 24% 81%, 9% 83%, 11% 68%, 0% 62%, 8% 50%, 0% 38%, 11% 32%, 9% 17%, 24% 19%, 28% 5%, 41% 12%)",
        },
        children: [
          node({
            id: "label",
            html: content.label,
            editable: true,
            layout: FLOW,
            css: {
              fontFamily: "var(--font-body)",
              fontWeight: "900",
              fontSize: "40px",
              lineHeight: "1.05",
              textAlign: "center",
              color: "var(--background)",
              rotate: "-8deg",
              maxWidth: "170px",
            },
          }),
        ],
      }),
  },
  {
    id: "stamp",
    name: "Stamp",
    group: "Badges & Tags",
    blurb: "dashed rubber-stamp seal (approved / limited / certified)",
    roles: ["badge"],
    tokensUsed: ["--accent", "--font-body"],
    slots: [{ key: "label", label: "Label", sample: "Limited edition" }],
    preview: { w: 460, h: 460 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "badge",
        layout,
        allowOverlap: true,
        css: {
          ...flexCenter,
          width: "230px",
          height: "230px",
          border: "4px dashed var(--accent)",
          borderRadius: "50%",
          rotate: "-12deg",
          opacity: "0.9",
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
              fontSize: "28px",
              lineHeight: "1.15",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              textAlign: "center",
              color: "var(--accent)",
              maxWidth: "170px",
            },
          }),
        ],
      }),
  },
]

registerAll(DEFS)
