// Theme — shadcn-style design tokens for the SCENE (distinct from the app
// shell's own theme in styles.css). Tokens are applied as CSS custom properties
// on the scene root node, so any node `css` can reference var(--primary),
// var(--radius), var(--font-heading)… and re-skinning is one declarative edit.
// Because the web layer is real CSS, this needs no special handling in the
// canvas paint. A brand kit (M6) compiles into exactly these tokens.

import type { Theme } from "./types"

export type TokenType = "color" | "length" | "font" | "shadow"

/** Token catalogue — drives the Theme panel UI and the agent's describe() vocab. */
export interface TokenDef {
  key: string // e.g. '--primary'
  label: string
  type: TokenType
  group: "color" | "type" | "shape"
  /** What the token is, in one plain-language line. */
  description: string
  /** Where you'll actually see it change on the canvas. */
  appliesTo: string
}

export const TOKENS: TokenDef[] = [
  {
    key: "--background",
    label: "Background",
    type: "color",
    group: "color",
    description: "The canvas backdrop the whole design sits on.",
    appliesTo: "Scene background, washes, and full-bleed panels.",
  },
  {
    key: "--foreground",
    label: "Foreground",
    type: "color",
    group: "color",
    description: "Default text color directly on the background.",
    appliesTo: "Body copy and labels that sit on the backdrop.",
  },
  {
    key: "--ink",
    label: "Ink (text on art)",
    type: "color",
    group: "color",
    description: "High-contrast text color used over artwork.",
    appliesTo: "Headlines and labels over cards, photos, and washes.",
  },
  {
    key: "--primary",
    label: "Primary",
    type: "color",
    group: "color",
    description: "The brand's main action color — the one people remember.",
    appliesTo: "CTA buttons, price tags, highlights, key shapes.",
  },
  {
    key: "--primary-foreground",
    label: "On primary",
    type: "color",
    group: "color",
    description: "Text and icons sitting on primary-colored surfaces.",
    appliesTo: "The label inside CTA buttons and primary chips.",
  },
  {
    key: "--accent",
    label: "Accent",
    type: "color",
    group: "color",
    description: "Secondary highlight color that supports primary.",
    appliesTo: "Badges, underlines, secondary buttons, gradient stops.",
  },
  {
    key: "--accent-2",
    label: "Accent 2",
    type: "color",
    group: "color",
    description: "A second accent for pairings and gradients.",
    appliesTo: "Gradient partners, duotone shapes, list markers.",
  },
  {
    key: "--muted",
    label: "Muted",
    type: "color",
    group: "color",
    description: "Low-emphasis gray for quiet text.",
    appliesTo: "Captions, fine print, secondary copy.",
  },
  {
    key: "--border",
    label: "Border",
    type: "color",
    group: "color",
    description: "Hairline stroke color for outlines and rules.",
    appliesTo: "Card outlines, frames, dividers, tick marks.",
  },
  {
    key: "--font-heading",
    label: "Heading font",
    type: "font",
    group: "type",
    description: "The display typeface with the brand's personality.",
    appliesTo: "Headlines, price callouts, big numbers.",
  },
  {
    key: "--font-body",
    label: "Body font",
    type: "font",
    group: "type",
    description: "The workhorse typeface for everything smaller.",
    appliesTo: "Body copy, buttons, captions, lists.",
  },
  {
    key: "--radius",
    label: "Radius",
    type: "length",
    group: "shape",
    description: "Corner roundness — 0 is sharp, 24px+ is soft.",
    appliesTo: "Cards, buttons, images, chips.",
  },
  {
    key: "--shadow",
    label: "Shadow",
    type: "shadow",
    group: "shape",
    description: "The depth/elevation style of floating elements.",
    appliesTo: "Cards, CTAs, and anything lifted off the backdrop.",
  },
  {
    key: "--space",
    label: "Spacing unit",
    type: "length",
    group: "shape",
    description: "The base unit paddings and gaps are built from.",
    appliesTo: "Inner padding and gaps inside every component.",
  },
]

/** Catalogue lookup by token key. */
export const tokenDef = (key: string): TokenDef | undefined =>
  TOKENS.find((t) => t.key === key)

export const DEFAULT_THEME: Theme = {
  mode: "dark",
  tokens: {
    "--background": "#0a0a0f",
    "--foreground": "oklch(0.97 0.002 285)",
    "--ink": "#ffffff",
    "--primary": "oklch(0.67 0.18 281)",
    "--primary-foreground": "oklch(0.16 0.02 281)",
    "--accent": "oklch(0.7 0.16 50)",
    "--accent-2": "oklch(0.62 0.2 350)",
    "--muted": "oklch(0.55 0.01 285)",
    "--border": "rgba(255,255,255,0.16)",
    "--font-heading": "'Playfair Display', Georgia, serif",
    "--font-body": "'Plus Jakarta Sans', system-ui, sans-serif",
    "--radius": "18px",
    "--shadow": "0 24px 60px rgba(0,0,0,0.35)",
    "--space": "16px",
  },
}

export interface ThemePreset {
  name: string
  label: string
  theme: Theme
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: "studio", label: "Studio", theme: DEFAULT_THEME },
  {
    name: "luxe-gold",
    label: "Luxe Gold",
    theme: {
      mode: "dark",
      tokens: {
        ...DEFAULT_THEME.tokens,
        "--background": "#0c0a07",
        "--primary": "oklch(0.78 0.13 85)",
        "--primary-foreground": "oklch(0.2 0.04 85)",
        "--accent": "oklch(0.8 0.12 85)",
        "--accent-2": "oklch(0.6 0.1 70)",
        "--font-heading": "'Playfair Display', Georgia, serif",
      },
    },
  },
  {
    name: "neon-pop",
    label: "Neon Pop",
    theme: {
      mode: "dark",
      tokens: {
        ...DEFAULT_THEME.tokens,
        "--background": "#07070d",
        "--primary": "oklch(0.72 0.2 200)",
        "--accent": "oklch(0.75 0.22 320)",
        "--accent-2": "oklch(0.78 0.2 150)",
        "--font-heading": "'Bebas Neue', sans-serif",
        "--radius": "8px",
      },
    },
  },
  {
    name: "mono-press",
    label: "Mono Press",
    theme: {
      mode: "light",
      tokens: {
        ...DEFAULT_THEME.tokens,
        "--background": "#f6f5f1",
        "--foreground": "oklch(0.2 0.01 80)",
        "--ink": "#15140f",
        "--primary": "oklch(0.25 0.02 80)",
        "--primary-foreground": "#f6f5f1",
        "--accent": "oklch(0.55 0.18 25)",
        "--accent-2": "oklch(0.45 0.02 80)",
        "--font-heading": "'Plus Jakarta Sans', system-ui, sans-serif",
        "--radius": "4px",
      },
    },
  },
]

export const themeByName = (name: string): Theme | undefined =>
  THEME_PRESETS.find((p) => p.name === name)?.theme

/** The CSS custom properties to set on the scene root node (so children inherit). */
export function themeVars(theme: Theme): Record<string, string> {
  return { ...theme.tokens }
}
