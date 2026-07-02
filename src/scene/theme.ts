// Theme — shadcn-style design tokens for the SCENE (distinct from the app
// shell's own theme in styles.css). Tokens are applied as CSS custom properties
// on the scene root node, so any node `css` can reference var(--primary),
// var(--radius), var(--font-heading)… and re-skinning is one declarative edit.
// Because the web layer is real CSS, this needs no special handling in the
// canvas paint. A brand kit (M6) compiles into exactly these tokens.

import type { Theme } from "./types"

export type TokenType = "color" | "length" | "font"

/** Token catalogue — drives the Theme panel UI and the agent's describe() vocab. */
export interface TokenDef {
  key: string // e.g. '--primary'
  label: string
  type: TokenType
  group: "color" | "type" | "shape"
}

export const TOKENS: TokenDef[] = [
  { key: "--background", label: "Background", type: "color", group: "color" },
  { key: "--foreground", label: "Foreground", type: "color", group: "color" },
  { key: "--ink", label: "Ink (text on art)", type: "color", group: "color" },
  { key: "--primary", label: "Primary", type: "color", group: "color" },
  {
    key: "--primary-foreground",
    label: "On primary",
    type: "color",
    group: "color",
  },
  { key: "--accent", label: "Accent", type: "color", group: "color" },
  { key: "--accent-2", label: "Accent 2", type: "color", group: "color" },
  { key: "--muted", label: "Muted", type: "color", group: "color" },
  { key: "--border", label: "Border", type: "color", group: "color" },
  { key: "--font-heading", label: "Heading font", type: "font", group: "type" },
  { key: "--font-body", label: "Body font", type: "font", group: "type" },
  { key: "--radius", label: "Radius", type: "length", group: "shape" },
]

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
