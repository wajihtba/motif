// Backgrounds — full-canvas artistic backdrops built from layered gradients
// and masks over brand tokens. Insert FIRST (or send to back): later siblings
// paint on top. All size to 100% of their parent, so dropped at the root they
// dress the whole canvas.

import { node } from "../../scene/model"
import { registerAll } from "./registry"
import type { ComponentDef } from "./types"

const full: Record<string, string> = { width: "100%", height: "100%" }

const DEFS: ComponentDef[] = [
  {
    id: "bg-mesh",
    name: "Gradient Mesh",
    group: "Backgrounds",
    blurb: "soft multi-point gradient mesh over the brand background",
    roles: [],
    tokensUsed: ["--background", "--primary", "--accent", "--accent-2"],
    slots: [],
    variants: [
      {
        key: "mood",
        label: "Mood",
        def: "dusk",
        options: [
          {
            id: "dusk",
            label: "Dusk",
            css: {
              backgroundImage:
                "radial-gradient(circle at 15% 10%, var(--primary), transparent 55%), radial-gradient(circle at 90% 20%, var(--accent-2), transparent 50%), radial-gradient(circle at 70% 95%, var(--accent), transparent 55%)",
            },
          },
          {
            id: "corner",
            label: "Corner glow",
            css: {
              backgroundImage:
                "radial-gradient(circle at 0% 100%, var(--primary), transparent 65%), radial-gradient(circle at 100% 0%, var(--accent-2), transparent 60%)",
            },
          },
          {
            id: "center",
            label: "Center bloom",
            css: {
              backgroundImage:
                "radial-gradient(circle at 50% 45%, var(--primary), transparent 62%), radial-gradient(circle at 52% 48%, var(--accent-2), transparent 40%)",
            },
          },
        ],
      },
    ],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: { ...full, background: "var(--background)" },
      }),
  },
  {
    id: "bg-aurora",
    name: "Aurora",
    group: "Backgrounds",
    blurb: "blurred drifting color blobs — dreamy hero backdrop",
    roles: ["group"],
    tokensUsed: ["--background", "--primary", "--accent", "--accent-2"],
    slots: [],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        role: "group",
        layout,
        allowOverlap: true,
        css: { ...full, background: "var(--background)", overflow: "hidden" },
        children: [
          node({
            id: "blob1",
            layout: {
              mode: "absolute",
              anchor: "top-left",
              dx: -0.15,
              dy: -0.2,
              width: 0.7,
              height: 0.6,
            },
            css: {
              background: "var(--primary)",
              borderRadius: "50%",
              filter: "blur(90px)",
              opacity: "0.75",
            },
          }),
          node({
            id: "blob2",
            layout: {
              mode: "absolute",
              anchor: "top-right",
              dx: 0.2,
              dy: 0.05,
              width: 0.6,
              height: 0.55,
            },
            css: {
              background: "var(--accent-2)",
              borderRadius: "50%",
              filter: "blur(100px)",
              opacity: "0.6",
            },
          }),
          node({
            id: "blob3",
            layout: {
              mode: "absolute",
              anchor: "bottom-center",
              dx: -0.1,
              dy: 0.25,
              width: 0.8,
              height: 0.5,
            },
            css: {
              background: "var(--accent)",
              borderRadius: "50%",
              filter: "blur(110px)",
              opacity: "0.45",
            },
          }),
        ],
      }),
  },
  {
    id: "bg-rays",
    name: "Ray Burst",
    group: "Backgrounds",
    blurb: "vintage sunburst rays from a corner or the center",
    roles: [],
    tokensUsed: ["--background", "--primary"],
    slots: [],
    variants: [
      {
        key: "origin",
        label: "Origin",
        def: "top",
        options: [
          {
            id: "top",
            label: "Top center",
            css: {
              backgroundImage:
                "repeating-conic-gradient(from 80deg at 50% -10%, var(--primary) 0deg 4deg, transparent 4deg 14deg)",
            },
          },
          {
            id: "corner",
            label: "Corner",
            css: {
              backgroundImage:
                "repeating-conic-gradient(from 0deg at 0% 0%, var(--primary) 0deg 5deg, transparent 5deg 16deg)",
            },
          },
          {
            id: "center",
            label: "Center",
            css: {
              backgroundImage:
                "repeating-conic-gradient(from 0deg at 50% 50%, var(--primary) 0deg 6deg, transparent 6deg 18deg)",
            },
          },
        ],
      },
    ],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: { ...full, background: "var(--background)", opacity: "0.92" },
      }),
  },
  {
    id: "bg-waves",
    name: "Wave Layers",
    group: "Backgrounds",
    blurb: "stacked translucent arcs rising from the bottom",
    roles: [],
    tokensUsed: ["--background", "--primary", "--accent-2"],
    slots: [],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          ...full,
          background: "var(--background)",
          backgroundImage:
            "radial-gradient(120% 55% at 30% 118%, var(--primary) 40%, transparent 41%), radial-gradient(130% 60% at 75% 125%, var(--accent-2) 42%, transparent 43%), radial-gradient(150% 70% at 50% 135%, var(--primary) 45%, transparent 46%)",
        },
      }),
  },
  {
    id: "bg-grid-fade",
    name: "Fading Grid",
    group: "Backgrounds",
    blurb: "technical grid dissolving upward — tech launch energy",
    roles: [],
    tokensUsed: ["--background", "--accent"],
    slots: [],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          ...full,
          background: "var(--background)",
          backgroundImage:
            "linear-gradient(var(--accent) 1.5px, transparent 1.5px), linear-gradient(90deg, var(--accent) 1.5px, transparent 1.5px)",
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to top, black 15%, rgba(0,0,0,0.35) 55%, transparent 90%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 15%, rgba(0,0,0,0.35) 55%, transparent 90%)",
        },
      }),
  },
  {
    id: "bg-spotlight",
    name: "Spotlight",
    group: "Backgrounds",
    blurb: "stage glow pooling from above — product hero lighting",
    roles: [],
    tokensUsed: ["--background", "--primary"],
    slots: [],
    preview: { w: 800, h: 800 },
    build: ({ layout }) =>
      node({
        id: "surface",
        layout,
        allowOverlap: true,
        css: {
          ...full,
          background: "var(--background)",
          backgroundImage:
            "radial-gradient(60% 75% at 50% -10%, var(--primary), transparent 70%)",
        },
      }),
  },
]

registerAll(DEFS)
