// Cards — composed surfaces: product card and testimonial/quote card.
// Children use flow layout inside a flex surface, so the whole card places
// like any single element.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"
import { FLOW, bodyText, cardSurface, flexCenter, photoPlaceholder } from "./util"

const DEFS: ComponentDef[] = [
  {
    id: "card-product",
    name: "Product Card",
    group: "Cards",
    blurb: "photo + name + price + mini CTA on an elevated surface",
    roles: ["group", "image", "price", "cta"],
    tokensUsed: [
      "--border",
      "--radius",
      "--shadow",
      "--space",
      "--ink",
      "--accent",
      "--accent-2",
      "--primary",
      "--primary-foreground",
      "--font-body",
      "--font-heading",
    ],
    slots: [
      { key: "name", label: "Product name", sample: "Velvet Night Serum" },
      { key: "price", label: "Price", sample: "$49" },
      { key: "cta", label: "CTA label", sample: "Add to bag" },
    ],
    preview: { w: 620, h: 860 },
    build: ({ content, layout, image }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: { ...cardSurface, width: "460px" },
        children: [
          node({
            id: "photo",
            role: "image",
            image,
            imageFit: "cover",
            layout: FLOW,
            css: {
              width: "100%",
              height: "360px",
              borderRadius: "calc(var(--radius) * 0.75)",
              overflow: "hidden",
              ...(image ? {} : photoPlaceholder),
            },
          }),
          node({
            id: "name",
            html: content.name,
            editable: true,
            layout: FLOW,
            css: { ...bodyText, fontSize: "32px", fontWeight: "700" },
          }),
          node({
            id: "price",
            role: "price",
            html: content.price,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontFamily: "var(--font-heading)",
              fontSize: "40px",
              fontWeight: "700",
              color: "var(--accent)",
            },
          }),
          node({
            id: "cta",
            role: "cta",
            html: content.cta,
            editable: true,
            layout: FLOW,
            css: {
              ...flexCenter,
              alignSelf: "flex-start",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              fontFamily: "var(--font-body)",
              fontWeight: "700",
              fontSize: "26px",
              lineHeight: "1",
              padding: "calc(var(--space) * 1.1) calc(var(--space) * 2.4)",
              borderRadius: "var(--radius)",
              whiteSpace: "nowrap",
            },
          }),
        ],
      }),
  },
  {
    id: "card-testimonial",
    name: "Testimonial Card",
    group: "Cards",
    blurb: "customer quote with attribution on an elevated surface",
    roles: ["group", "meta"],
    tokensUsed: [
      "--border",
      "--radius",
      "--shadow",
      "--space",
      "--ink",
      "--accent",
      "--muted",
      "--font-body",
      "--font-heading",
    ],
    slots: [
      {
        key: "quote",
        label: "Quote",
        sample: "The only serum that actually kept its promise.",
      },
      { key: "name", label: "Name", sample: "Maya R." },
      { key: "role", label: "Role", sample: "Verified buyer" },
    ],
    preview: { w: 820, h: 560 },
    build: ({ content, layout }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        css: { ...cardSurface, width: "640px" },
        children: [
          node({
            id: "quotemark",
            html: "“",
            layout: FLOW,
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "110px",
              lineHeight: "0.6",
              color: "var(--accent)",
              margin: "0",
              marginTop: "calc(var(--space) * 0.5)",
            },
          }),
          node({
            id: "quote",
            html: content.quote,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontFamily: "var(--font-heading)",
              fontSize: "40px",
              lineHeight: "1.3",
            },
          }),
          node({
            id: "attribution",
            role: "meta",
            html: `<strong>${content.name}</strong> · ${content.role}`,
            editable: true,
            layout: FLOW,
            css: {
              ...bodyText,
              fontSize: "26px",
              color: "var(--muted)",
            },
          }),
        ],
      }),
  },
]

registerAll(DEFS)
