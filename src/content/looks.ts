// One-click "looks" — curated, ready-to-sell aesthetics that stack a full-scene
// shader + a pixel effect + per-role element shaders/filters/animations in a
// single click. Roles (set by the design composer) let a look target the
// headline, the CTA button, the sale badge… without guessing from CSS.
//
// applyLook() mutates the scene's elements in place and returns the full-scene
// shader + pixel effect for the caller to push onto the renderer.

import type { EffectLayer, ElementRole, FxTarget } from "../scene/types"

/** A per-element effect bundle a look applies to one role. */
export interface ElementFx {
  shader?: string
  shaderParams?: Record<string, number>
  shaderAnimate?: boolean
  shaderMaskContent?: boolean
  filter?: string
  anim?: string
}

export interface Look {
  name: string
  label: string
  emoji: string
  blurb: string
  /** Full-scene WebGL shader to activate (over the whole composite). */
  shader?: string
  /** Pixel effect (getImageData) to activate. */
  pixel?: string
  /** Effects applied per element role. "*text" = every text role not otherwise set. */
  roles?: Partial<Record<ElementRole | "*text", ElementFx>>
}

const TEXT_ROLES: ElementRole[] = [
  "eyebrow",
  "headline",
  "subhead",
  "cta",
  "badge",
  "price",
  "meta",
]

export const LOOKS: Look[] = [
  {
    name: "flashsale",
    label: "Flash Sale",
    emoji: "⚡",
    blurb: "Spotlight + gold headline, glowing CTA, starburst badge",
    shader: "spotlight",
    roles: {
      headline: { shader: "goldFoil", shaderAnimate: true },
      cta: { shader: "shineBorder", shaderAnimate: true },
      badge: { shader: "starburst", shaderAnimate: true },
      eyebrow: { filter: "warm" },
    },
  },
  {
    name: "luxury",
    label: "Luxury",
    emoji: "💎",
    blurb: "Cinematic grade, gold-foil headline, sparkle accents",
    shader: "cinematic",
    roles: {
      headline: { shader: "goldFoil", shaderParams: { speed: 0.3 } },
      eyebrow: {
        shader: "sparkle",
        shaderAnimate: true,
        shaderParams: { density: 0.7 },
      },
      badge: { shader: "goldFoil" },
    },
  },
  {
    name: "festive",
    label: "Festive",
    emoji: "🎉",
    blurb: "Bokeh lights, sparkling headline, starburst badge",
    shader: "bokeh",
    roles: {
      headline: { shader: "sparkle", shaderAnimate: true },
      badge: {
        shader: "starburst",
        shaderAnimate: true,
        shaderParams: { hue: 0.33 },
      },
    },
  },
  {
    name: "neonnight",
    label: "Neon Night",
    emoji: "🌃",
    blurb: "Bloom glow, neon headline + CTA, cool grade",
    shader: "bloom",
    roles: {
      headline: {
        shader: "neon",
        shaderAnimate: true,
        shaderParams: { hue: 0.83 },
      },
      cta: { shader: "neon", shaderAnimate: true, shaderParams: { hue: 0.55 } },
      subhead: { filter: "cool" },
    },
  },
  {
    name: "cyberpunk",
    label: "Cyberpunk",
    emoji: "🤖",
    blurb: "VHS scene, chroma headline, glowing border CTA",
    shader: "vhs",
    roles: {
      headline: { filter: "cyberpunk" },
      cta: {
        shader: "shineBorder",
        shaderAnimate: true,
        shaderParams: { hue: 0.5 },
      },
      "*text": { filter: "cyberpunk" },
    },
  },
  {
    name: "vaporwave",
    label: "Vaporwave",
    emoji: "🌴",
    blurb: "Duotone scene, holo-foil headline, retro grade",
    shader: "duotone",
    roles: {
      headline: { shader: "iridescent", shaderAnimate: true },
      badge: { shader: "goldFoil" },
      "*text": { filter: "vaporwave" },
    },
  },
  {
    name: "retroprint",
    label: "Retro Print",
    emoji: "📰",
    blurb: "Halftone newsprint, comic headline, sticker badge",
    shader: "halftone",
    roles: {
      headline: { shader: "comic" },
      badge: { shader: "sticker" },
    },
  },
  {
    name: "firesale",
    label: "Fire Sale",
    emoji: "🔥",
    blurb: "Spotlight + flaming headline, spinning starburst badge",
    shader: "spotlight",
    roles: {
      headline: { shader: "fire", shaderAnimate: true },
      badge: { shader: "starburst", shaderAnimate: true },
    },
  },
  {
    name: "holographic",
    label: "Holographic",
    emoji: "✨",
    blurb: "Spotlight + iridescent headline & badge, sparkle eyebrow",
    shader: "spotlight",
    roles: {
      headline: { shader: "iridescent", shaderAnimate: true },
      badge: { shader: "iridescent", shaderAnimate: true },
      eyebrow: { shader: "sparkle", shaderAnimate: true },
    },
  },
  {
    name: "glitchdrop",
    label: "Glitch Drop",
    emoji: "📺",
    blurb: "Full-scene glitch, datamoshed headline, RGB grade",
    shader: "glitchScene",
    roles: {
      headline: { shader: "glitch", shaderAnimate: true },
      cta: { shader: "scanlines", shaderAnimate: true },
    },
  },
  {
    name: "monoeditorial",
    label: "Mono Editorial",
    emoji: "🖤",
    blurb: "Duotone scene, noir text, clean gloss CTA",
    shader: "duotone",
    roles: {
      cta: { shader: "shine", shaderAnimate: true },
      "*text": { filter: "noir" },
    },
  },
  {
    name: "cleanfocus",
    label: "Clean Focus",
    emoji: "🎯",
    blurb: "Subtle spotlight + a single gloss sweep on the CTA",
    shader: "spotlight",
    roles: {
      cta: { shader: "shine", shaderAnimate: true },
    },
  },
  {
    name: "liquidmetal",
    label: "Liquid Metal",
    emoji: "🪙",
    blurb: "Chrome liquid-metal headline & badge over a spotlit scene",
    shader: "spotlight",
    roles: {
      headline: { shader: "liquidMetal", shaderAnimate: true },
      badge: {
        shader: "liquidMetal",
        shaderAnimate: true,
        shaderParams: { hue: 0.08 },
      },
      cta: { shader: "chrome", shaderAnimate: true },
    },
  },
  {
    name: "thermalpop",
    label: "Thermal Pop",
    emoji: "🌡️",
    blurb: "Dithered scene, heatmap headline, color-panel badge",
    shader: "dithering",
    roles: {
      headline: { shader: "heatmap", shaderAnimate: true },
      badge: { shader: "colorPanels", shaderAnimate: true },
      cta: { shader: "shineBorder", shaderAnimate: true },
    },
  },
]

export const lookByName = (name?: string): Look | undefined =>
  name ? LOOKS.find((l) => l.name === name) : undefined

/** All effect layers a look contributes — a canvas-target scene shader/pixel plus
 *  role-targeted element shaders/filters. Tagged `owner:'look'` so the controller
 *  can drop the previous look's layers before applying a new one. Returned as
 *  loose partials; the controller's normalize gate seeds params + resolves kinds. */
export function lookToLayers(look: Look): Partial<EffectLayer>[] {
  const layers: Partial<EffectLayer>[] = []
  const canvas: FxTarget = { type: "canvas" }
  if (look.shader)
    layers.push({
      effect: look.shader,
      target: canvas,
      owner: "look",
      animate: true,
    })
  if (look.pixel)
    layers.push({ effect: look.pixel, target: canvas, owner: "look" })

  const roles = look.roles ?? {}
  const add = (role: ElementRole, fx: ElementFx) => {
    const target: FxTarget = { type: "role", role }
    const scope = TEXT_ROLES.includes(role) ? "content" : "box"
    if (fx.shader)
      layers.push({
        effect: fx.shader,
        target,
        scope,
        animate: fx.shaderAnimate ?? false,
        params: fx.shaderParams,
        owner: "look",
      })
    if (fx.filter)
      layers.push({ effect: fx.filter, target, scope: "box", owner: "look" })
  }

  // Explicit roles first; '*text' fills any text role left unset.
  for (const [role, fx] of Object.entries(roles)) {
    if (role === "*text") continue
    add(role as ElementRole, fx)
  }
  const textFallback = roles["*text"]
  if (textFallback) {
    for (const role of TEXT_ROLES) if (!roles[role]) add(role, textFallback)
  }
  return layers
}
