// The example gallery — a curated set of finished, ready-to-open projects that
// seed the home grid on first visit (see gallery-seed.ts). Each entry is a
// complete Document: a real HTML/CSS scene tree with semantic roles, a design
// token theme, one of the curated looks (baked into scene.effects) and a couple
// of engine animations, sized to a real platform format.
//
// The set is deliberately broad — ecommerce (fashion / electronics / beauty /
// Black Friday), SaaS (launch / feature / app / webinar), food (bistro /
// coffee), plus fitness, real estate, travel, events, podcast, finance and
// gaming — so a first-time visitor can see every effect family, animation and
// format in a professional context and open any of them to keep editing.
//
// Composition is lint-safe by construction (see controller/lint.ts): full-bleed
// backdrops and decorative shapes carry decor roles ("image"/"scrim") so text
// layered over them is never flagged, text blocks are vertically spaced and
// width-bounded so they never collide or overflow the frame, and surfaces
// (badges / CTAs) sit clear of the copy.

import type { Anchor, Layout, Size } from "../scene/layout"
import type {
  AnimTrack,
  Brief,
  Document,
  EffectLayer,
  Scene,
  SceneNode,
  Theme,
} from "../scene/types"
import { normalizeLayer, normalizeTrack } from "../controller/normalize"
import { formatByKey } from "./formats"
import { lookByName, lookToLayers } from "./looks"
import { emptyDocument, node, rootNode } from "../scene/model"
import { DEFAULT_THEME } from "../scene/theme"

// --- composition helpers ------------------------------------------------------

const FULL: Layout = {
  mode: "absolute",
  anchor: "top-left",
  dx: 0,
  dy: 0,
  width: 1,
  height: 1,
}

function abs(
  anchor: Anchor,
  dx: number,
  dy: number,
  width: Size = "auto",
  height: Size = "auto"
): Layout {
  return { mode: "absolute", anchor, dx, dy, width, height }
}

/** Full-bleed painted backdrop. Decor role → never a lint target. */
function bg(css: Record<string, string>): SceneNode {
  return node({ id: "bg", role: "image", layout: FULL, css })
}

/** A decorative shape (blob, ring, panel). Decor role + allowOverlap so it can
 *  sit anywhere behind the content without tripping the overlap lint. */
function shape(layout: Layout, css: Record<string, string>): SceneNode {
  return node({ role: "image", layout, css, allowOverlap: true })
}

/** A text element with sensible type defaults. */
function txt(
  role: SceneNode["role"],
  html: string,
  layout: Layout,
  css: Record<string, string>
): SceneNode {
  return node({
    role,
    html,
    editable: true,
    layout,
    css: {
      fontFamily: "var(--font-body)",
      color: "var(--ink)",
      margin: "0",
      ...css,
    },
  })
}

/** A pill CTA button (surface + label). */
function cta(
  html: string,
  css: Record<string, string> = {},
  layout: Layout = abs("bottom-center", 0, -0.1)
): SceneNode {
  return node({
    role: "cta",
    html,
    editable: true,
    layout,
    css: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--primary)",
      color: "var(--primary-foreground)",
      fontFamily: "var(--font-body)",
      fontWeight: "700",
      fontSize: "34px",
      padding: "22px 56px",
      borderRadius: "999px",
      whiteSpace: "nowrap",
      ...css,
    },
  })
}

/** A round corner badge (surface + label), placed clear of the copy. */
function badge(
  html: string,
  css: Record<string, string> = {},
  layout: Layout = abs("top-right", -0.06, 0.06, 0.17, 0.17)
): SceneNode {
  return node({
    role: "badge",
    html,
    layout,
    css: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      background: "var(--accent)",
      color: "#12100a",
      fontFamily: "var(--font-body)",
      fontWeight: "800",
      fontSize: "40px",
      lineHeight: "1",
      borderRadius: "50%",
      boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
      ...css,
    },
  })
}

// --- example spec -------------------------------------------------------------

export interface GalleryExample {
  /** Stable project id — the seeder upserts by this. */
  id: string
  name: string
  /** Human domain label (for the card chip). */
  domain: string
  /** One-line description of what it demonstrates. */
  blurb: string
  /** formats.ts key → drives baseWidth/baseHeight. */
  format: string
  brief: Brief
  background: string
  /** Theme token overrides merged onto DEFAULT_THEME. */
  theme: { mode: Theme["mode"]; tokens: Record<string, string> }
  /** Top-level children under the scene root. */
  build: () => SceneNode[]
  /** Curated look baked into scene.effects. */
  look?: string
  /** Extra hand-authored effect layers. */
  effects?: Partial<EffectLayer>[]
  /** Engine animations baked into scene.animations. */
  anims?: Partial<AnimTrack>[]
  /** Video timeline length (seconds). */
  duration?: number
}

// A shared serif and sans stack that degrade gracefully (only Montserrat ships
// as a webfont; these fall back to strong system faces).
const SERIF = "'Playfair Display', 'Times New Roman', Georgia, serif"
const SANS = "'Montserrat Variable', 'Helvetica Neue', system-ui, sans-serif"

export const GALLERY: GalleryExample[] = [
  // 1. Fashion ecommerce — luxury drop -----------------------------------------
  {
    id: "ex-fashion-noir",
    name: "Atelier — Midnight Drop",
    domain: "Fashion",
    blurb: "Luxury look · gold-foil headline · riseIn",
    format: "ig-post",
    brief: {
      goal: "Tease a limited fashion capsule",
      audience: "Design-led shoppers",
      tone: "Quiet luxury",
    },
    background: "radial-gradient(120% 100% at 50% 0%, #17130c 0%, #050505 65%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f6efe1",
        "--primary": "#f2e3bf",
        "--primary-foreground": "#1a1509",
        "--accent": "#d9bd7a",
        "--muted": "#a99b7d",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "luxury",
    anims: [
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      { preset: "fadeIn", target: { type: "role", role: "cta" }, start: 0.7 },
    ],
    build: () => [
      bg({
        background:
          "radial-gradient(120% 100% at 50% 0%, #17130c 0%, #050505 65%)",
      }),
      shape(abs("center", 0, -0.02, 0.52, 0.5), {
        borderRadius: "50%",
        background:
          "conic-gradient(from 210deg, #3a2f19, #7a6329, #f2e3bf, #6b551f, #2a2211)",
        filter: "blur(2px)",
        opacity: "0.55",
      }),
      shape(abs("center", 0, -0.02, 0.42, 0.42), {
        borderRadius: "50%",
        border: "1px solid rgba(242,227,191,0.35)",
      }),
      txt(
        "eyebrow",
        "AUTUMN CAPSULE 2026",
        abs("top-center", 0, 0.13, 0.8, "auto"),
        {
          fontSize: "26px",
          letterSpacing: "0.42em",
          textAlign: "center",
          color: "var(--accent)",
          fontWeight: "600",
        }
      ),
      txt(
        "headline",
        "Noir<br/>Édition",
        abs("center", 0, -0.02, 0.86, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "150px",
          fontWeight: "700",
          lineHeight: "0.94",
          textAlign: "center",
          letterSpacing: "-0.01em",
        }
      ),
      txt(
        "subhead",
        "Twelve pieces. Cut once. Gone by Sunday.",
        abs("center", 0, 0.19, 0.78, "auto"),
        {
          fontSize: "30px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      cta("Join the list", {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      }),
    ],
  },

  // 2. Electronics ecommerce — product launch ----------------------------------
  {
    id: "ex-tech-earbuds",
    name: "Pulse Buds — Launch",
    domain: "Electronics",
    blurb: "Neon Night · bloom glow · float",
    format: "og",
    brief: {
      goal: "Launch wireless earbuds",
      audience: "Commuters & gym-goers",
      tone: "Sleek, energetic",
    },
    background:
      "linear-gradient(120deg, #04070f 0%, #0a1430 55%, #06122b 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#eaf4ff",
        "--primary": "oklch(0.72 0.2 200)",
        "--primary-foreground": "#04121c",
        "--accent": "oklch(0.75 0.22 200)",
        "--muted": "#8fa8c8",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "neonnight",
    anims: [
      {
        preset: "float",
        target: { type: "elements", ids: ["product"] },
        loop: true,
      },
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(120deg, #04070f 0%, #0a1430 55%, #06122b 100%)",
      }),
      shape(abs("center-right", -0.02, 0.0, 0.5, 0.95), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 40% 40%, rgba(56,189,248,0.55), rgba(56,189,248,0) 60%)",
        filter: "blur(6px)",
      }),
      node({
        id: "product",
        role: "image",
        layout: abs("center-right", -0.14, 0.0, 0.34, 0.66),
        css: {
          borderRadius: "48px",
          background:
            "linear-gradient(150deg, #1b2b4d 0%, #0d1830 60%), radial-gradient(circle at 30% 25%, rgba(120,200,255,0.5), rgba(0,0,0,0) 50%)",
          boxShadow:
            "0 60px 120px rgba(20,120,220,0.35), inset 0 2px 40px rgba(120,200,255,0.25)",
          border: "1px solid rgba(120,200,255,0.35)",
        },
        allowOverlap: true,
      }),
      txt(
        "eyebrow",
        "NEW · ACTIVE NOISE CANCELLING",
        abs("top-left", 0.07, 0.16, 0.6, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.28em",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Pulse Buds",
        abs("center-left", 0.07, -0.06, 0.56, "auto"),
        {
          fontSize: "128px",
          fontWeight: "800",
          lineHeight: "0.95",
          letterSpacing: "-0.03em",
        }
      ),
      txt(
        "subhead",
        "40-hour battery. Studio sound. Weightless in the ear.",
        abs("center-left", 0.07, 0.11, 0.5, "auto"),
        { fontSize: "28px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      cta(
        "Pre-order — $149",
        {},
        abs("bottom-left", 0.07, -0.14, "auto", "auto")
      ),
    ],
  },

  // 3. Beauty ecommerce — skincare ---------------------------------------------
  {
    id: "ex-beauty-serum",
    name: "Lumè — Glow Serum",
    domain: "Beauty",
    blurb: "Holographic · iridescent · popIn",
    format: "pin",
    brief: {
      goal: "Sell a hydrating glow serum",
      audience: "Skincare enthusiasts",
      tone: "Fresh, dewy, premium",
    },
    background:
      "linear-gradient(160deg, #ffe9f0 0%, #ffd9e6 45%, #ffeede 100%)",
    theme: {
      mode: "light",
      tokens: {
        "--background": "#ffe9f0",
        "--ink": "#4a2038",
        "--foreground": "#4a2038",
        "--primary": "#e0679a",
        "--primary-foreground": "#fff",
        "--accent": "#f7b3cd",
        "--muted": "#9c5f7c",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "holographic",
    anims: [
      {
        preset: "popIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      {
        preset: "sway",
        target: { type: "elements", ids: ["bottle"] },
        loop: true,
      },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(160deg, #ffe9f0 0%, #ffd9e6 45%, #ffeede 100%)",
      }),
      shape(abs("bottom-center", 0, 0.16, 0.9, 0.5), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,255,255,0.8), rgba(255,255,255,0) 65%)",
        filter: "blur(10px)",
      }),
      node({
        id: "bottle",
        role: "image",
        layout: abs("center", 0, 0.06, 0.28, 0.4),
        css: {
          borderRadius: "40px 40px 46px 46px",
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.9), #ffd0e0 70%)",
          boxShadow: "0 40px 80px rgba(200,80,140,0.3)",
          border: "2px solid rgba(255,255,255,0.9)",
        },
        allowOverlap: true,
      }),
      txt(
        "eyebrow",
        "HYALURONIC + VITAMIN C",
        abs("top-center", 0, 0.09, 0.86, "auto"),
        {
          fontSize: "26px",
          letterSpacing: "0.24em",
          textAlign: "center",
          color: "var(--muted)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Glow<br/>Serum",
        abs("top-center", 0, 0.15, 0.86, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "132px",
          fontWeight: "700",
          lineHeight: "0.92",
          textAlign: "center",
        }
      ),
      txt(
        "subhead",
        "Dewy, plumped skin in 7 days — clinically loved.",
        abs("bottom-center", 0, -0.2, 0.82, "auto"),
        {
          fontSize: "30px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      cta("Shop the glow"),
    ],
  },

  // 4. SaaS — product launch ---------------------------------------------------
  {
    id: "ex-saas-launch",
    name: "Cadence — Ship Faster",
    domain: "SaaS",
    blurb: "Clean Focus · gloss CTA · riseIn",
    format: "og",
    brief: {
      goal: "Announce a project-management tool",
      audience: "Product & engineering teams",
      tone: "Confident, modern",
    },
    background:
      "radial-gradient(120% 120% at 15% 10%, #1a1740 0%, #0a0a1a 60%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f2f2ff",
        "--primary": "oklch(0.67 0.18 281)",
        "--primary-foreground": "#0b0a1f",
        "--accent": "oklch(0.72 0.16 200)",
        "--muted": "#a3a3c2",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "cleanfocus",
    anims: [
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.05,
      },
      {
        preset: "fadeIn",
        target: { type: "elements", ids: ["chip1", "chip2", "chip3"] },
        start: 0.4,
        stagger: 0.12,
      },
    ],
    build: () => [
      bg({
        background:
          "radial-gradient(120% 120% at 15% 10%, #1a1740 0%, #0a0a1a 60%)",
      }),
      shape(abs("bottom-right", 0.05, 0.08, 0.5, 0.7), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 50% 50%, rgba(124,92,246,0.4), rgba(124,92,246,0) 62%)",
        filter: "blur(4px)",
      }),
      txt("eyebrow", "CADENCE 2.0", abs("top-left", 0.07, 0.15, 0.6, "auto"), {
        fontSize: "24px",
        letterSpacing: "0.34em",
        color: "var(--accent)",
        fontWeight: "700",
      }),
      txt(
        "headline",
        "Ship faster,<br/>guess less.",
        abs("center-left", 0.07, -0.08, 0.7, "auto"),
        {
          fontSize: "104px",
          fontWeight: "800",
          lineHeight: "0.98",
          letterSpacing: "-0.03em",
        }
      ),
      txt(
        "subhead",
        "Roadmaps, sprints and docs that finally agree with each other.",
        abs("center-left", 0.07, 0.12, 0.6, "auto"),
        { fontSize: "27px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      node({
        id: "chip1",
        role: "meta",
        html: "Roadmap",
        layout: abs("bottom-left", 0.07, -0.13, "auto", "auto"),
        css: chipCss(),
      }),
      node({
        id: "chip2",
        role: "meta",
        html: "Sprints",
        layout: abs("bottom-left", 0.24, -0.13, "auto", "auto"),
        css: chipCss(),
      }),
      node({
        id: "chip3",
        role: "meta",
        html: "Insights",
        layout: abs("bottom-left", 0.39, -0.13, "auto", "auto"),
        css: chipCss(),
      }),
      cta("Start free", {}, abs("bottom-right", -0.07, -0.13, "auto", "auto")),
    ],
  },

  // 5. SaaS — feature announcement (editorial) ---------------------------------
  {
    id: "ex-saas-feature",
    name: "Cadence — AI Standups",
    domain: "SaaS",
    blurb: "Mono Editorial · duotone · header format",
    format: "x-header",
    brief: {
      goal: "Announce an AI feature",
      audience: "Existing customers",
      tone: "Editorial, restrained",
    },
    background: "#f4f2ec",
    theme: {
      mode: "light",
      tokens: {
        "--background": "#f4f2ec",
        "--ink": "#141210",
        "--foreground": "#141210",
        "--primary": "#141210",
        "--primary-foreground": "#f4f2ec",
        "--accent": "#c8492e",
        "--muted": "#6b665d",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "monoeditorial",
    anims: [
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({ background: "#f4f2ec" }),
      shape(abs("center-right", -0.06, 0, 0.28, 0.62), {
        borderRadius: "24px",
        background: "linear-gradient(150deg, #141210, #3a352d)",
      }),
      shape(abs("center-right", -0.1, 0.12, 0.14, 0.14), {
        borderRadius: "50%",
        background: "var(--accent)",
      }),
      txt(
        "eyebrow",
        "NOW IN BETA",
        abs("center-left", 0.05, -0.22, 0.5, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.32em",
          color: "var(--accent)",
          fontWeight: "800",
        }
      ),
      txt(
        "headline",
        "AI standups that write themselves.",
        abs("center-left", 0.05, -0.02, 0.55, "auto"),
        {
          fontSize: "72px",
          fontWeight: "800",
          lineHeight: "1.02",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "Cadence drafts the update from your commits and PRs.",
        abs("center-left", 0.05, 0.24, 0.52, "auto"),
        { fontSize: "26px", color: "var(--muted)" }
      ),
    ],
  },

  // 6. Restaurant — bistro menu ------------------------------------------------
  {
    id: "ex-bistro-menu",
    name: "Maison Verde — Bistro",
    domain: "Restaurant",
    blurb: "Retro Print · halftone · sticker badge",
    format: "ig-post",
    brief: {
      goal: "Promote a weekend brunch menu",
      audience: "Local food lovers",
      tone: "Warm, hand-made",
    },
    background: "linear-gradient(160deg, #1f3a2e 0%, #14261e 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f7efe0",
        "--primary": "#e8b04b",
        "--primary-foreground": "#1a1405",
        "--accent": "#e8b04b",
        "--muted": "#b7c7b3",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "retroprint",
    anims: [
      {
        preset: "fadeIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      { preset: "popIn", target: { type: "role", role: "badge" }, start: 0.5 },
    ],
    build: () => [
      bg({ background: "linear-gradient(160deg, #1f3a2e 0%, #14261e 100%)" }),
      shape(abs("center", 0, 0, 0.78, 0.78), {
        borderRadius: "50%",
        border: "2px solid rgba(232,176,75,0.4)",
      }),
      txt(
        "eyebrow",
        "SAT & SUN · 9–2",
        abs("top-center", 0, 0.13, 0.8, "auto"),
        {
          fontSize: "26px",
          letterSpacing: "0.34em",
          textAlign: "center",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Weekend<br/>Brunch",
        abs("center", 0, -0.03, 0.86, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "138px",
          fontWeight: "700",
          lineHeight: "0.94",
          textAlign: "center",
          fontStyle: "italic",
        }
      ),
      txt(
        "subhead",
        "Wood-fired sourdough · farm eggs · house granola",
        abs("center", 0, 0.2, 0.8, "auto"),
        {
          fontSize: "27px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.5",
        }
      ),
      badge("Bottomless<br/>coffee", {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        fontSize: "26px",
        fontWeight: "800",
        transform: "rotate(-12deg)",
      }),
      cta("Book a table", {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      }),
    ],
  },

  // 7. Coffee shop — story promo -----------------------------------------------
  {
    id: "ex-coffee-story",
    name: "Ember Coffee — Cold Brew",
    domain: "Café",
    blurb: "Clean Focus · warm grade · float",
    format: "ig-story",
    brief: {
      goal: "Push a summer cold brew",
      audience: "Coffee regulars",
      tone: "Cozy, inviting",
    },
    background: "linear-gradient(180deg, #3a2416 0%, #1c110a 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f6e7d4",
        "--primary": "#e6a45c",
        "--primary-foreground": "#221206",
        "--accent": "#e6a45c",
        "--muted": "#c9a888",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "cleanfocus",
    anims: [
      {
        preset: "float",
        target: { type: "elements", ids: ["cup"] },
        loop: true,
      },
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.15,
      },
    ],
    build: () => [
      bg({ background: "linear-gradient(180deg, #3a2416 0%, #1c110a 100%)" }),
      shape(abs("center", 0, 0.02, 0.72, 0.44), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(230,164,92,0.35), rgba(230,164,92,0) 65%)",
        filter: "blur(8px)",
      }),
      node({
        id: "cup",
        role: "image",
        layout: abs("center", 0, 0.02, 0.4, 0.3),
        css: {
          borderRadius: "36px",
          background: "linear-gradient(160deg, #6b4326, #3a2414)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.5)",
          border: "1px solid rgba(230,164,92,0.35)",
        },
        allowOverlap: true,
      }),
      txt(
        "eyebrow",
        "SLOW-STEEPED 18 HOURS",
        abs("top-center", 0, 0.11, 0.86, "auto"),
        {
          fontSize: "28px",
          letterSpacing: "0.26em",
          textAlign: "center",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Cold<br/>Brew<br/>Season",
        abs("top-center", 0, 0.17, 0.9, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "150px",
          fontWeight: "700",
          lineHeight: "0.9",
          textAlign: "center",
        }
      ),
      txt(
        "subhead",
        "Smooth, low-acid, endlessly refillable all summer.",
        abs("bottom-center", 0, -0.22, 0.8, "auto"),
        {
          fontSize: "32px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      cta("Grab yours — $4"),
    ],
  },

  // 8. Fitness — gym challenge -------------------------------------------------
  {
    id: "ex-gym-challenge",
    name: "Forge Gym — 30-Day",
    domain: "Fitness",
    blurb: "Thermal Pop · heatmap · pulse",
    format: "ig-story",
    brief: {
      goal: "Recruit for a 30-day challenge",
      audience: "New-year gym-goers",
      tone: "High-energy, bold",
    },
    background:
      "linear-gradient(180deg, #1a0505 0%, #300a0a 55%, #120303 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#fff2ec",
        "--primary": "#ff5a1f",
        "--primary-foreground": "#1a0603",
        "--accent": "#ffd23f",
        "--muted": "#e0a595",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "thermalpop",
    anims: [
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.05,
      },
      { preset: "pulse", target: { type: "role", role: "cta" }, loop: true },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(180deg, #1a0505 0%, #300a0a 55%, #120303 100%)",
      }),
      shape(abs("top-center", 0, -0.1, 0.9, 0.5), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,90,31,0.4), rgba(255,90,31,0) 65%)",
        filter: "blur(6px)",
      }),
      txt("eyebrow", "STARTS MONDAY", abs("top-center", 0, 0.1, 0.86, "auto"), {
        fontSize: "30px",
        letterSpacing: "0.3em",
        textAlign: "center",
        color: "var(--accent)",
        fontWeight: "800",
      }),
      txt(
        "headline",
        "30 DAYS<br/>ALL IN",
        abs("top-center", 0, 0.17, 0.92, "auto"),
        {
          fontSize: "184px",
          fontWeight: "900",
          lineHeight: "0.86",
          textAlign: "center",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "Coached sessions, a plan that fits your week, real results.",
        abs("center", 0, 0.14, 0.82, "auto"),
        {
          fontSize: "32px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      badge(
        "50%<br/>OFF",
        {
          background: "var(--accent)",
          color: "#1a0603",
          fontSize: "40px",
          transform: "rotate(10deg)",
        },
        abs("top-right", -0.08, 0.28, 0.2, 0.2)
      ),
      cta("Claim my spot", {}, abs("bottom-center", 0, -0.12)),
    ],
  },

  // 9. Real estate — luxury listing --------------------------------------------
  {
    id: "ex-realestate-villa",
    name: "Cliffside Villa — For Sale",
    domain: "Real Estate",
    blurb: "Luxury · cinematic grade · fadeIn",
    format: "og",
    brief: {
      goal: "Advertise a luxury property",
      audience: "High-net-worth buyers",
      tone: "Elegant, aspirational",
    },
    background: "linear-gradient(135deg, #0c1a17 0%, #16302a 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#eef3ef",
        "--primary": "#cbb482",
        "--primary-foreground": "#141410",
        "--accent": "#cbb482",
        "--muted": "#a9bcb3",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "luxury",
    anims: [
      {
        preset: "fadeIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({ background: "linear-gradient(135deg, #0c1a17 0%, #16302a 100%)" }),
      shape(abs("center-right", -0.05, 0, 0.4, 0.78), {
        borderRadius: "20px",
        background: "linear-gradient(160deg, #2b463d, #16302a)",
        border: "1px solid rgba(203,180,130,0.3)",
      }),
      txt(
        "eyebrow",
        "MONTECITO · CALIFORNIA",
        abs("top-left", 0.06, 0.14, 0.55, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.3em",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Cliffside<br/>Villa",
        abs("center-left", 0.06, -0.11, 0.55, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "108px",
          fontWeight: "700",
          lineHeight: "0.95",
        }
      ),
      txt(
        "subhead",
        "5 bed · 6 bath · ocean frontage",
        abs("center-left", 0.06, 0.16, 0.55, "auto"),
        { fontSize: "26px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      txt("price", "$12.4M", abs("bottom-left", 0.06, -0.12, "auto", "auto"), {
        fontFamily: "var(--font-heading)",
        fontSize: "60px",
        fontWeight: "700",
        color: "var(--accent)",
      }),
      cta(
        "Private viewing",
        {
          background: "transparent",
          color: "var(--ink)",
          border: "1px solid var(--accent)",
        },
        abs("bottom-right", -0.06, -0.13, "auto", "auto")
      ),
    ],
  },

  // 10. Travel — destination pin -----------------------------------------------
  {
    id: "ex-travel-santorini",
    name: "Aegean — Escape Sale",
    domain: "Travel",
    blurb: "Festive bokeh · sunset grade · float",
    format: "pin",
    brief: {
      goal: "Sell a summer package holiday",
      audience: "Couples planning a getaway",
      tone: "Dreamy, warm",
    },
    background:
      "linear-gradient(180deg, #ff9e6d 0%, #ff6b8b 45%, #7a4bd0 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#fff7f0",
        "--primary": "#fff",
        "--primary-foreground": "#a03a5a",
        "--accent": "#ffe07a",
        "--muted": "#ffe3d6",
        "--font-heading": SERIF,
        "--font-body": SANS,
      },
    },
    look: "festive",
    anims: [
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      {
        preset: "float",
        target: { type: "elements", ids: ["sun"] },
        loop: true,
      },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(180deg, #ff9e6d 0%, #ff6b8b 45%, #7a4bd0 100%)",
      }),
      node({
        id: "sun",
        role: "image",
        layout: abs("center", 0, -0.06, 0.42, 0.28),
        css: {
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #fff3c4 0%, #ffd166 55%, rgba(255,209,102,0) 72%)",
        },
        allowOverlap: true,
      }),
      shape(abs("bottom-center", 0, 0.02, 1, 0.32), {
        background:
          "linear-gradient(180deg, rgba(122,75,208,0) 0%, rgba(60,30,90,0.6) 100%)",
      }),
      txt(
        "eyebrow",
        "5 NIGHTS · FLIGHTS INCLUDED",
        abs("top-center", 0, 0.09, 0.9, "auto"),
        {
          fontSize: "26px",
          letterSpacing: "0.22em",
          textAlign: "center",
          color: "var(--ink)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Santorini<br/>Summer",
        abs("top-center", 0, 0.16, 0.92, "auto"),
        {
          fontFamily: "var(--font-heading)",
          fontSize: "130px",
          fontWeight: "700",
          lineHeight: "0.94",
          textAlign: "center",
          fontStyle: "italic",
        }
      ),
      txt(
        "subhead",
        "Cliffside suites, caldera sunsets, from $899pp.",
        abs("bottom-center", 0, -0.2, 0.86, "auto"),
        {
          fontSize: "30px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      cta("Book the escape"),
    ],
  },

  // 11. Event — music festival -------------------------------------------------
  {
    id: "ex-festival-neon",
    name: "Nova Nights — Festival",
    domain: "Event",
    blurb: "Glitch Drop · datamosh headline · popIn",
    format: "ig-story",
    brief: {
      goal: "Announce a music festival lineup",
      audience: "Gen-Z music fans",
      tone: "Loud, electric",
    },
    background: "radial-gradient(120% 90% at 50% 30%, #2a0a52 0%, #08010f 70%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f4ecff",
        "--primary": "#ff3ca6",
        "--primary-foreground": "#12001a",
        "--accent": "#37e6ff",
        "--muted": "#c3a8e6",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "glitchdrop",
    anims: [
      {
        preset: "popIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      {
        preset: "fadeIn",
        target: { type: "role", role: "meta" },
        start: 0.5,
      },
    ],
    build: () => [
      bg({
        background:
          "radial-gradient(120% 90% at 50% 30%, #2a0a52 0%, #08010f 70%)",
      }),
      shape(abs("center", -0.16, -0.05, 0.5, 0.5), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,60,166,0.5), rgba(255,60,166,0) 62%)",
        filter: "blur(4px)",
      }),
      shape(abs("center", 0.18, 0.08, 0.5, 0.5), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(55,230,255,0.45), rgba(55,230,255,0) 62%)",
        filter: "blur(4px)",
      }),
      txt(
        "eyebrow",
        "AUG 22–24 · WATERFRONT PARK",
        abs("top-center", 0, 0.1, 0.92, "auto"),
        {
          fontSize: "26px",
          letterSpacing: "0.2em",
          textAlign: "center",
          color: "var(--accent)",
          fontWeight: "800",
        }
      ),
      txt(
        "headline",
        "NOVA<br/>NIGHTS",
        abs("center", 0, -0.06, 0.94, "auto"),
        {
          fontSize: "196px",
          fontWeight: "900",
          lineHeight: "0.84",
          textAlign: "center",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "meta",
        "AURORA · KID VELVET · LOWTIDE · +30",
        abs("center", 0, 0.16, 0.9, "auto"),
        {
          fontSize: "30px",
          textAlign: "center",
          color: "var(--ink)",
          fontWeight: "700",
          letterSpacing: "0.05em",
        }
      ),
      cta("Get tickets", {}, abs("bottom-center", 0, -0.11)),
    ],
  },

  // 12. Podcast — episode drop -------------------------------------------------
  {
    id: "ex-podcast-vapor",
    name: "Signal & Noise — Ep. 42",
    domain: "Podcast",
    blurb: "Vaporwave · holo-foil · sway",
    format: "ig-post",
    brief: {
      goal: "Promote a new podcast episode",
      audience: "Tech & culture listeners",
      tone: "Retro-futurist",
    },
    background:
      "linear-gradient(160deg, #2b1055 0%, #7f2a86 55%, #ff6fae 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#fdf4ff",
        "--primary": "#3df0e0",
        "--primary-foreground": "#0a1f1d",
        "--accent": "#ffe86b",
        "--muted": "#f0cdf0",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "vaporwave",
    anims: [
      {
        preset: "sway",
        target: { type: "elements", ids: ["disc"] },
        loop: true,
      },
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(160deg, #2b1055 0%, #7f2a86 55%, #ff6fae 100%)",
      }),
      shape(abs("bottom-center", 0, 0.28, 1.2, 0.6), {
        borderRadius: "50%",
        background:
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 40px)",
        transform: "perspective(400px) rotateX(60deg)",
      }),
      node({
        id: "disc",
        role: "image",
        layout: abs("top-center", 0, 0.12, 0.4, 0.4),
        css: {
          borderRadius: "50%",
          background:
            "conic-gradient(from 0deg, #3df0e0, #ffe86b, #ff6fae, #3df0e0)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        },
        allowOverlap: true,
      }),
      txt("eyebrow", "EPISODE 42", abs("center", 0, 0.02, 0.6, "auto"), {
        fontSize: "28px",
        letterSpacing: "0.34em",
        textAlign: "center",
        color: "var(--accent)",
        fontWeight: "800",
      }),
      txt(
        "headline",
        "Signal &<br/>Noise",
        abs("center", 0, 0.16, 0.9, "auto"),
        {
          fontSize: "120px",
          fontWeight: "900",
          lineHeight: "0.92",
          textAlign: "center",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "Why every app wants to be your operating system.",
        abs("bottom-center", 0, -0.18, 0.82, "auto"),
        {
          fontSize: "28px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      cta("Listen now", {}, abs("bottom-center", 0, -0.07)),
    ],
  },

  // 13. Ecommerce — Black Friday -----------------------------------------------
  {
    id: "ex-blackfriday",
    name: "Volt — Black Friday",
    domain: "Ecommerce",
    blurb: "Fire Sale · flaming headline · spin badge",
    format: "ig-post",
    brief: {
      goal: "Drive Black Friday sales",
      audience: "Deal hunters",
      tone: "Urgent, loud",
    },
    background:
      "radial-gradient(120% 100% at 50% 100%, #3a0d00 0%, #0a0300 70%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#fff3e6",
        "--primary": "#ff7a18",
        "--primary-foreground": "#1a0600",
        "--accent": "#ffd23f",
        "--muted": "#e6b79a",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "firesale",
    anims: [
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.05,
      },
      { preset: "spin", target: { type: "role", role: "badge" }, loop: true },
      {
        preset: "heartbeat",
        target: { type: "role", role: "cta" },
        loop: true,
      },
    ],
    build: () => [
      bg({
        background:
          "radial-gradient(120% 100% at 50% 100%, #3a0d00 0%, #0a0300 70%)",
      }),
      txt(
        "eyebrow",
        "48 HOURS ONLY",
        abs("top-center", 0, 0.115, "auto", "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.2em",
          textAlign: "center",
          color: "var(--accent)",
          fontWeight: "800",
        }
      ),
      txt(
        "headline",
        "BLACK<br/>FRIDAY",
        abs("center", 0, -0.05, 0.92, "auto"),
        {
          fontSize: "184px",
          fontWeight: "900",
          lineHeight: "0.84",
          textAlign: "center",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "Up to 70% off everything. No codes, no catch.",
        abs("center", 0, 0.16, 0.82, "auto"),
        {
          fontSize: "32px",
          textAlign: "center",
          color: "var(--muted)",
          lineHeight: "1.4",
        }
      ),
      badge(
        "−70%",
        {
          background: "var(--accent)",
          color: "#1a0600",
          fontSize: "52px",
          fontWeight: "900",
        },
        abs("top-right", -0.06, 0.045, 0.2, 0.2)
      ),
      cta("Shop the sale", {}, abs("bottom-center", 0, -0.1)),
    ],
  },

  // 14. SaaS/mobile — app download ---------------------------------------------
  {
    id: "ex-app-download",
    name: "Sprout — Habit App",
    domain: "Mobile App",
    blurb: "Clean Focus · phone mockup · float",
    format: "og",
    brief: {
      goal: "Drive app installs",
      audience: "People building habits",
      tone: "Friendly, calm",
    },
    background: "linear-gradient(135deg, #0b2018 0%, #10362a 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#eafff5",
        "--primary": "#37d99a",
        "--primary-foreground": "#04160f",
        "--accent": "#8ef0c4",
        "--muted": "#9fc9b6",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "cleanfocus",
    anims: [
      {
        preset: "float",
        target: { type: "elements", ids: ["phone"] },
        loop: true,
      },
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({ background: "linear-gradient(135deg, #0b2018 0%, #10362a 100%)" }),
      shape(abs("center-right", -0.12, 0, 0.44, 0.9), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(55,217,154,0.35), rgba(55,217,154,0) 62%)",
        filter: "blur(6px)",
      }),
      node({
        id: "phone",
        role: "image",
        layout: abs("center-right", -0.14, 0.0, 0.24, 0.82),
        css: {
          borderRadius: "54px",
          background: "linear-gradient(170deg, #123528, #061a12)",
          border: "3px solid rgba(142,240,196,0.4)",
          boxShadow: "0 50px 110px rgba(0,0,0,0.5)",
        },
        allowOverlap: true,
      }),
      txt(
        "eyebrow",
        "iOS · ANDROID",
        abs("top-left", 0.07, 0.15, 0.5, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.3em",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Small steps,<br/>every day.",
        abs("center-left", 0.07, -0.06, 0.6, "auto"),
        {
          fontSize: "100px",
          fontWeight: "800",
          lineHeight: "0.98",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "Gentle streaks that actually stick. 4.9★, 60k reviews.",
        abs("center-left", 0.07, 0.13, 0.52, "auto"),
        { fontSize: "27px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      cta("Download free", {}, abs("bottom-left", 0.07, -0.14, "auto", "auto")),
    ],
  },

  // 15. B2B — webinar ----------------------------------------------------------
  {
    id: "ex-webinar",
    name: "Scale Summit — Webinar",
    domain: "Webinar",
    blurb: "Neon Night · corporate grade · slideIn",
    format: "og",
    brief: {
      goal: "Register attendees for a live webinar",
      audience: "Growth & marketing leaders",
      tone: "Professional, sharp",
    },
    background: "linear-gradient(120deg, #071226 0%, #0d1f45 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#eef4ff",
        "--primary": "#4f8dff",
        "--primary-foreground": "#03101f",
        "--accent": "#57d0ff",
        "--muted": "#9db4d6",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "neonnight",
    anims: [
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
      { preset: "fadeIn", target: { type: "role", role: "meta" }, start: 0.5 },
    ],
    build: () => [
      bg({ background: "linear-gradient(120deg, #071226 0%, #0d1f45 100%)" }),
      shape(abs("top-right", 0.06, -0.08, 0.5, 0.6), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(79,141,255,0.4), rgba(79,141,255,0) 62%)",
        filter: "blur(4px)",
      }),
      txt(
        "eyebrow",
        "LIVE WEBINAR · FREE",
        abs("top-left", 0.06, 0.14, 0.6, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.3em",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Growth loops<br/>that compound.",
        abs("center-left", 0.06, -0.06, 0.72, "auto"),
        {
          fontSize: "92px",
          fontWeight: "800",
          lineHeight: "1.0",
          letterSpacing: "-0.02em",
        }
      ),
      txt(
        "subhead",
        "A 45-min teardown of the funnels behind 5 breakout startups.",
        abs("center-left", 0.06, 0.13, 0.62, "auto"),
        { fontSize: "26px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      txt(
        "meta",
        "THU · MAR 14 · 11AM PT",
        abs("bottom-left", 0.06, -0.14, "auto", "auto"),
        {
          fontSize: "26px",
          fontWeight: "800",
          letterSpacing: "0.06em",
          color: "var(--accent)",
        }
      ),
      cta(
        "Save my seat",
        {},
        abs("bottom-right", -0.06, -0.14, "auto", "auto")
      ),
    ],
  },

  // 16. Finance — crypto exchange ----------------------------------------------
  {
    id: "ex-crypto-chrome",
    name: "Ledgerly — Zero Fees",
    domain: "Fintech",
    blurb: "Liquid Metal · chrome CTA · float",
    format: "og",
    brief: {
      goal: "Promote a fee-free trading week",
      audience: "Retail crypto traders",
      tone: "Premium, techy",
    },
    background:
      "linear-gradient(135deg, #0a0a0f 0%, #17171f 60%, #0a0a0f 100%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f4f5fa",
        "--primary": "#c7cdd6",
        "--primary-foreground": "#0a0a0f",
        "--accent": "#9fe870",
        "--muted": "#9aa0ab",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "liquidmetal",
    anims: [
      {
        preset: "float",
        target: { type: "elements", ids: ["coin"] },
        loop: true,
      },
      {
        preset: "riseIn",
        target: { type: "role", role: "headline" },
        start: 0.1,
      },
    ],
    build: () => [
      bg({
        background:
          "linear-gradient(135deg, #0a0a0f 0%, #17171f 60%, #0a0a0f 100%)",
      }),
      node({
        id: "coin",
        role: "image",
        layout: abs("center-right", -0.12, 0, 0.32, 0.58),
        css: {
          borderRadius: "50%",
          background:
            "conic-gradient(from 220deg, #6b7280, #e5e7eb, #9ca3af, #f9fafb, #4b5563)",
          boxShadow: "0 50px 110px rgba(0,0,0,0.6)",
          border: "2px solid rgba(255,255,255,0.4)",
        },
        allowOverlap: true,
      }),
      txt(
        "eyebrow",
        "LIMITED · THIS WEEK",
        abs("top-left", 0.06, 0.15, 0.55, "auto"),
        {
          fontSize: "24px",
          letterSpacing: "0.3em",
          color: "var(--accent)",
          fontWeight: "700",
        }
      ),
      txt(
        "headline",
        "Trade with<br/>zero fees.",
        abs("center-left", 0.06, -0.1, 0.6, "auto"),
        {
          fontSize: "100px",
          fontWeight: "800",
          lineHeight: "0.98",
          letterSpacing: "-0.03em",
        }
      ),
      txt(
        "subhead",
        "Buy, sell and swap 200+ assets — no spread, no surprises.",
        abs("center-left", 0.06, 0.15, 0.54, "auto"),
        { fontSize: "26px", color: "var(--muted)", lineHeight: "1.4" }
      ),
      cta("Start trading", {}, abs("bottom-left", 0.06, -0.14, "auto", "auto")),
    ],
  },

  // 17. Gaming — YouTube thumbnail ---------------------------------------------
  {
    id: "ex-gaming-thumb",
    name: "Nightfall — Ep. 1",
    domain: "Gaming",
    blurb: "Cyberpunk · VHS grade · slideIn (YT thumb)",
    format: "yt",
    brief: {
      goal: "Thumbnail for a gameplay series premiere",
      audience: "Gaming subscribers",
      tone: "Punchy, high-contrast",
    },
    background: "radial-gradient(120% 120% at 20% 0%, #2a0836 0%, #05010a 70%)",
    theme: {
      mode: "dark",
      tokens: {
        "--ink": "#f6ecff",
        "--primary": "#ff2e88",
        "--primary-foreground": "#12001a",
        "--accent": "#20e3ff",
        "--muted": "#c8a8e0",
        "--font-heading": SANS,
        "--font-body": SANS,
      },
    },
    look: "cyberpunk",
    anims: [
      {
        preset: "slideIn",
        target: { type: "role", role: "headline" },
        start: 0.05,
      },
      { preset: "pulse", target: { type: "role", role: "badge" }, loop: true },
    ],
    build: () => [
      bg({
        background:
          "radial-gradient(120% 120% at 20% 0%, #2a0836 0%, #05010a 70%)",
      }),
      shape(abs("center-right", -0.04, 0, 0.42, 1.0), {
        background:
          "linear-gradient(90deg, rgba(32,227,255,0) 0%, rgba(32,227,255,0.28) 100%)",
      }),
      shape(abs("center-left", 0.02, 0.2, 0.5, 0.5), {
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,46,136,0.5), rgba(255,46,136,0) 60%)",
        filter: "blur(4px)",
      }),
      txt("eyebrow", "NEW SERIES", abs("top-left", 0.05, 0.12, 0.5, "auto"), {
        fontSize: "34px",
        letterSpacing: "0.3em",
        color: "var(--accent)",
        fontWeight: "800",
      }),
      txt(
        "headline",
        "NIGHT<br/>FALL",
        abs("center-left", 0.05, -0.02, 0.62, "auto"),
        {
          fontSize: "196px",
          fontWeight: "900",
          lineHeight: "0.82",
          letterSpacing: "-0.03em",
        }
      ),
      badge(
        "EP.1",
        {
          background: "var(--primary)",
          color: "#fff",
          borderRadius: "20px",
          fontSize: "48px",
          fontWeight: "900",
        },
        abs("bottom-right", -0.05, -0.1, 0.22, 0.24)
      ),
    ],
  },
]

/** Shared chip style for the SaaS feature chips. */
function chipCss(): Record<string, string> {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-body)",
    fontSize: "22px",
    fontWeight: "700",
    color: "var(--ink)",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
    padding: "12px 26px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  }
}

// --- build a Document from a spec ---------------------------------------------

/** Compose a full, valid Document from a gallery spec — nodes, theme, and
 *  baked effect/animation layers (run through the same normalize gate the
 *  agent and UI use, so params/kinds are seeded and only valid layers land). */
export function buildGalleryDocument(ex: GalleryExample): Document {
  const fmt = formatByKey(ex.format)
  const doc = emptyDocument(ex.name)

  const theme: Theme = {
    mode: ex.theme.mode,
    tokens: { ...DEFAULT_THEME.tokens, ...ex.theme.tokens },
  }

  const scene: Scene = {
    baseWidth: fmt.w,
    baseHeight: fmt.h,
    format: ex.format,
    background: ex.background,
    theme,
    root: rootNode(ex.build()),
    animations: [],
    effects: [],
    timeline: { duration: ex.duration ?? 5, fps: 30 },
  }

  // Bake the look's stacked effects.
  const look = ex.look ? lookByName(ex.look) : undefined
  if (look) {
    for (const raw of lookToLayers(look)) {
      const layer = normalizeLayer(raw, { type: "canvas" })
      if (layer) scene.effects.push(layer)
    }
  }
  // Extra hand-authored effects.
  for (const raw of ex.effects ?? []) {
    const layer = normalizeLayer(raw, { type: "canvas" })
    if (layer) scene.effects.push(layer)
  }
  // Animations.
  for (const raw of ex.anims ?? []) {
    const track = normalizeTrack(raw, { type: "canvas" })
    if (track) scene.animations.push(track)
  }

  doc.name = ex.name
  doc.brief = ex.brief
  doc.scene = scene
  return doc
}
