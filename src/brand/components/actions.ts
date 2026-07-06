// Actions — call-to-action buttons. The canonical brandable element: filled
// and outline CTAs with shape/size/case axes.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef, VariantAxis } from "./types"
import { flexCenter } from "./util"

const shapeAxis: VariantAxis = {
  key: "shape",
  label: "Shape",
  def: "rounded",
  options: [
    { id: "square", label: "Square", css: { borderRadius: "0px" } },
    { id: "rounded", label: "Rounded", css: { borderRadius: "var(--radius)" } },
    { id: "pill", label: "Pill", css: { borderRadius: "999px" } },
  ],
}

const sizeAxis: VariantAxis = {
  key: "size",
  label: "Size",
  def: "md",
  options: [
    {
      id: "sm",
      label: "Small",
      css: {
        fontSize: "26px",
        padding: "calc(var(--space) * 0.9) calc(var(--space) * 2.2)",
      },
    },
    {
      id: "md",
      label: "Medium",
      css: {
        fontSize: "34px",
        padding: "calc(var(--space) * 1.4) calc(var(--space) * 3.5)",
      },
    },
    {
      id: "lg",
      label: "Large",
      css: {
        fontSize: "44px",
        padding: "calc(var(--space) * 1.8) calc(var(--space) * 4.5)",
      },
    },
  ],
}

const caseAxis: VariantAxis = {
  key: "case",
  label: "Case",
  def: "normal",
  options: [
    { id: "normal", label: "Normal", css: { textTransform: "none" } },
    {
      id: "uppercase",
      label: "Uppercase",
      css: { textTransform: "uppercase", letterSpacing: "0.08em" },
    },
  ],
}

const ctaBase: Record<string, string> = {
  ...flexCenter,
  fontFamily: "var(--font-body)",
  fontWeight: "700",
  whiteSpace: "nowrap",
  lineHeight: "1",
}

const finishAxis: VariantAxis = {
  key: "finish",
  label: "Finish",
  def: "flat",
  options: [
    { id: "flat", label: "Flat" },
    {
      id: "gradient",
      label: "Gradient",
      css: {
        backgroundImage:
          "linear-gradient(135deg, var(--primary), var(--accent-2))",
      },
    },
    {
      id: "glossy",
      label: "Glossy",
      css: {
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.05) 55%, rgba(0,0,0,0.12))",
      },
    },
  ],
}

const DEFS: ComponentDef[] = [
  {
    id: "cta",
    name: "CTA Button",
    group: "Actions",
    blurb: "filled brand call-to-action",
    roles: ["cta"],
    tokensUsed: [
      "--primary",
      "--primary-foreground",
      "--accent-2",
      "--font-body",
      "--radius",
      "--space",
      "--shadow",
    ],
    slots: [{ key: "label", label: "Label", sample: "Shop now" }],
    variants: [shapeAxis, sizeAxis, caseAxis, finishAxis],
    preview: { w: 700, h: 320 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "cta",
        html: content.label,
        editable: true,
        layout,
        css: {
          ...ctaBase,
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          boxShadow: "var(--shadow)",
        },
      }),
  },
  {
    id: "cta-outline",
    name: "Outline CTA",
    group: "Actions",
    blurb: "bordered secondary call-to-action",
    roles: ["cta"],
    tokensUsed: ["--primary", "--font-body", "--radius", "--space"],
    slots: [{ key: "label", label: "Label", sample: "Learn more" }],
    variants: [shapeAxis, sizeAxis, caseAxis],
    preview: { w: 700, h: 320 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "cta",
        html: content.label,
        editable: true,
        layout,
        css: {
          ...ctaBase,
          background: "transparent",
          border: "3px solid var(--primary)",
          color: "var(--primary)",
        },
      }),
  },
  {
    id: "cta-link",
    name: "Link CTA",
    group: "Actions",
    blurb: "quiet text call-to-action with an accent arrow",
    roles: ["cta"],
    tokensUsed: ["--ink", "--accent", "--font-body"],
    slots: [{ key: "label", label: "Label", sample: "Explore the collection" }],
    variants: [
      {
        key: "underline",
        label: "Underline",
        def: "on",
        options: [
          {
            id: "on",
            label: "Underlined",
            css: {
              textDecoration: "underline",
              textDecorationColor: "var(--accent)",
              textUnderlineOffset: "10px",
              textDecorationThickness: "3px",
            },
          },
          { id: "off", label: "Plain" },
        ],
      },
    ],
    preview: { w: 800, h: 240 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "cta",
        html: `${content.label} <span style="color:var(--accent)">→</span>`,
        editable: true,
        layout,
        css: {
          fontFamily: "var(--font-body)",
          fontWeight: "700",
          fontSize: "32px",
          color: "var(--ink)",
          whiteSpace: "nowrap",
        },
      }),
  },
  {
    id: "cta-glass",
    name: "Glass CTA",
    group: "Actions",
    blurb: "frosted translucent button that floats over photos",
    roles: ["cta"],
    tokensUsed: [
      "--ink",
      "--border",
      "--font-body",
      "--radius",
      "--space",
      "--shadow",
    ],
    slots: [{ key: "label", label: "Label", sample: "Watch the film" }],
    variants: [shapeAxis, sizeAxis],
    preview: { w: 700, h: 320 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "cta",
        html: content.label,
        editable: true,
        layout,
        css: {
          ...ctaBase,
          background: "rgba(255,255,255,0.12)",
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))",
          border: "1px solid var(--border)",
          color: "var(--ink)",
          boxShadow: "var(--shadow)",
        },
      }),
  },
]

registerAll(DEFS)
