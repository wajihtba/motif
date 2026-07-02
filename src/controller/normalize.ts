// The normalize gate v2 — the single repair point that makes loose, partial
// agent input "just work" (docs/plan/03-agent-first.md §5). Layered:
//
//   parse     zod schemas (dispatch.ts) — malformed shapes abort the batch
//   resolve   ids: exact → role name → fuzzy (edit distance ≤2) → selection
//   clamp     registry ranges (fx in M3, anim in M4)
//   sanitize  HTML allowlist / CSS deny-list (scene/validate.ts)
//
// Repairable issues never abort — they apply with a warning the agent sees in
// its diff result. Unresolvable ids and unknown commands abort the whole
// batch (transactionality: one tool call = one undoable step, or nothing).

import type {
  AnimTrack,
  EffectLayer,
  FxTarget,
  Scene,
  SceneNode,
  Theme,
} from "../scene/types"
import { defaultLayout } from "../scene/layout"
import { flatten, node as makeNode, uid } from "../scene/model"
import { DEFAULT_THEME, themeByName } from "../scene/theme"
import {
  sanitizeCss,
  sanitizeHtml,
  sanitizeImageSrc,
  sanitizeStylesheet,
} from "../scene/validate"
import { findEffect, paramDefaults, supportsOf } from "../effects/core/registry"
import "../effects" // register the catalogues before any normalize call
import { CommandAbort } from "./types"

export type Warn = (msg: string) => void
const noWarn: Warn = () => {}

// --- id resolution ------------------------------------------------------------

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

/** Resolve a node reference: exact id → role name → fuzzy id. When `raw` is
 *  absent, falls back to the primary selection. Throws CommandAbort when
 *  nothing resolves — a wrong-element edit is worse than no edit. */
export function resolveNodeId(
  scene: Scene,
  raw: string | undefined,
  selection: string[],
  warn: Warn = noWarn
): string {
  if (!raw) {
    const primary = selection[selection.length - 1]
    if (primary) return primary
    throw new CommandAbort("no element id given and nothing is selected")
  }
  const nodes = [scene.root, ...flatten(scene.root)]
  if (nodes.some((n) => n.id === raw)) return raw

  const byRole = nodes.find((n) => n.role === raw)
  if (byRole) {
    warn(`resolved "${raw}" by role → ${byRole.id}`)
    return byRole.id
  }
  let best: { id: string; d: number } | null = null
  for (const n of nodes) {
    const d = editDistance(raw, n.id)
    if (d <= 2 && (!best || d < best.d)) best = { id: n.id, d }
  }
  if (best) {
    warn(`fuzzy-matched "${raw}" → ${best.id}`)
    return best.id
  }
  throw new CommandAbort(`unknown element "${raw}"`)
}

// --- targets -------------------------------------------------------------------

export function normalizeTarget(
  raw: unknown,
  fallback: FxTarget,
  scene?: Scene,
  warn: Warn = noWarn
): FxTarget {
  const t = raw as FxTarget | undefined
  if (!t || typeof t !== "object") return fallback
  if (t.type === "canvas") return { type: "canvas" }
  if (t.type === "role" && typeof t.role === "string") {
    return { type: "role", role: t.role }
  }
  if (t.type === "elements" && Array.isArray(t.ids)) {
    const ids = t.ids.filter((x): x is string => typeof x === "string")
    const resolved = scene
      ? ids.map((id) => resolveNodeId(scene, id, [], warn))
      : ids
    return resolved.length ? { type: "elements", ids: resolved } : fallback
  }
  return fallback
}

// --- nodes ---------------------------------------------------------------------

/** Repair one node and its subtree: ids seeded, html/css/image sanitized. */
export function normalizeNode(
  raw: Partial<SceneNode>,
  warn: Warn = noWarn
): SceneNode {
  const css = raw.css && typeof raw.css === "object" ? { ...raw.css } : {}
  const cssResult = sanitizeCss(css)
  cssResult.warnings.forEach(warn)

  let html: string | undefined
  if (typeof raw.html === "string") {
    const r = sanitizeHtml(raw.html)
    r.warnings.forEach(warn)
    html = r.value
  }
  let image: string | undefined
  if (typeof raw.image === "string") {
    const r = sanitizeImageSrc(raw.image)
    r.warnings.forEach(warn)
    image = r.value ?? undefined
  }

  const n = makeNode({
    id: typeof raw.id === "string" ? raw.id : undefined,
    role: raw.role,
    tag: safeTag(raw.tag, warn),
    html,
    image,
    imageFit: raw.imageFit,
    layout: raw.layout ?? defaultLayout(),
    css: cssResult.value,
    editable: raw.editable,
    hidden: raw.hidden,
    locked: raw.locked,
  })
  if (Array.isArray(raw.children) && raw.children.length) {
    n.children = raw.children.map((c) => normalizeNode(c, warn))
    delete n.html // children win over html (document invariant)
  }
  return n
}

const SAFE_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "header",
  "footer",
  "figure",
  "ul",
  "ol",
  "li",
  "blockquote",
])

function safeTag(tag: string | undefined, warn: Warn): string | undefined {
  if (!tag) return undefined
  const t = tag.toLowerCase()
  if (SAFE_TAGS.has(t)) return t
  warn(`replaced tag <${tag}> with <div>`)
  return "div"
}

// --- effect layers (registry-aware: clamp → coerce → sanitize) ----------------

/** GLSL sandbox-compile hook — the renderer backend provides it when a GL
 *  context exists (headless/server contexts skip the check). A compile
 *  failure returns the shader info log so the agent can fix its GLSL in the
 *  same turn (docs/plan/03-agent-first.md §5). */
export type GlslValidator = (
  kind: "element" | "scene",
  frag: string
) => string | null

let glslValidator: GlslValidator | null = null
export function setGlslValidator(fn: GlslValidator | null): void {
  glslValidator = fn
}

export function normalizeLayer(
  raw: Partial<EffectLayer>,
  fallbackTarget: FxTarget,
  warn: Warn = noWarn
): EffectLayer | null {
  if (typeof raw.effect !== "string" || !raw.effect) {
    warn("dropped effect layer without an effect id")
    return null
  }
  const found = findEffect(raw.effect, raw.kind)
  if (!found || found.kind === "anim") {
    warn(`unknown effect "${raw.effect}"`)
    return null
  }
  const { def } = found
  const kind = found.kind
  const supports = supportsOf(def)

  // Params: registry defaults, provided values clamped to declared ranges.
  const params = paramDefaults(def)
  if (raw.params && typeof raw.params === "object") {
    for (const p of def.params) {
      const v = raw.params[p.key]
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      const clamped = Math.max(p.min, Math.min(p.max, v))
      if (clamped !== v) warn(`clamped ${def.id}.${p.key} ${v} → ${clamped}`)
      params[p.key] = clamped
    }
  }

  // Target/scope: coerce to what the effect supports.
  let target = normalizeTarget(raw.target, fallbackTarget)
  if (target.type !== "canvas" && !supports.targets.includes("element")) {
    warn(`"${def.id}" is canvas-only — retargeted to the whole canvas`)
    target = { type: "canvas" }
  }
  if (target.type === "canvas" && !supports.targets.includes("canvas")) {
    if (fallbackTarget.type !== "canvas") {
      target = fallbackTarget
    } else {
      warn(`"${def.id}" needs an element target (select something first)`)
      return null
    }
  }
  const scope =
    raw.scope && supports.scopes.includes(raw.scope)
      ? raw.scope
      : (supports.scopes[0] ?? "box")

  // Custom GLSL escape hatch: sandbox-compile BEFORE it enters the document.
  let frag: string | undefined
  if (def.id === "custom") {
    if (typeof raw.frag !== "string" || !raw.frag.trim()) {
      throw new CommandAbort(
        'the "custom" effect requires a GLSL frag body: vec4 fx(){ … }'
      )
    }
    const log = glslValidator?.("element", raw.frag)
    if (log) {
      throw new CommandAbort(
        `GLSL failed to compile — fix and retry. Compiler log:\n${log}`
      )
    }
    frag = raw.frag
  }

  return {
    id: typeof raw.id === "string" ? raw.id : uid("fx"),
    effect: def.id,
    kind,
    params,
    animate: supports.animatable
      ? raw.animate !== false && def.animated
      : false,
    enabled: raw.enabled !== false,
    target,
    scope,
    frag,
    owner: typeof raw.owner === "string" ? raw.owner : undefined,
  }
}

export function normalizeTrack(
  raw: Partial<AnimTrack>,
  fallbackTarget: FxTarget,
  warn: Warn = noWarn
): AnimTrack | null {
  const hasPreset = typeof raw.preset === "string" && raw.preset
  const hasTracks = Array.isArray(raw.tracks) && raw.tracks.length
  if (!hasPreset && !hasTracks) {
    warn("dropped animation without preset or keyframes")
    return null
  }
  return {
    id: typeof raw.id === "string" ? raw.id : uid("anim"),
    target: normalizeTarget(raw.target, fallbackTarget),
    enabled: raw.enabled !== false,
    preset: hasPreset ? raw.preset : undefined,
    params: numericRecord(raw.params),
    start: numOr(raw.start, 0),
    duration: raw.duration != null ? numOr(raw.duration, 1) : undefined,
    loop: raw.loop,
    stagger: raw.stagger != null ? numOr(raw.stagger, 0) : undefined,
    tracks: hasTracks ? raw.tracks : undefined,
    owner: typeof raw.owner === "string" ? raw.owner : undefined,
  }
}

function numericRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "number" && Number.isFinite(val)) out[k] = val
    }
  }
  return out
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

// --- theme & scene --------------------------------------------------------------

export function normalizeTheme(raw: Partial<Theme>, base: Theme): Theme {
  return {
    mode:
      raw.mode === "light" ? "light" : raw.mode === "dark" ? "dark" : base.mode,
    tokens: {
      ...base.tokens,
      ...(raw.tokens && typeof raw.tokens === "object" ? raw.tokens : {}),
    },
  }
}

/** Build a complete, valid Scene from a partial one (scene.apply /
 *  motif_generate). Missing pieces inherit from `prev`. */
export function normalizeScene(
  raw: Partial<Scene> & { theme?: Partial<Theme> | string },
  prev: Scene,
  warn: Warn = noWarn
): Scene {
  let theme: Theme = prev.theme
  if (typeof raw.theme === "string") {
    const preset = themeByName(raw.theme)
    if (preset) theme = structuredClone(preset)
    else warn(`unknown theme preset "${raw.theme}"`)
  } else if (raw.theme && typeof raw.theme === "object") {
    theme = normalizeTheme(raw.theme, prev.theme)
  }

  let stylesheet = prev.stylesheet
  if (typeof raw.stylesheet === "string") {
    const r = sanitizeStylesheet(raw.stylesheet)
    r.warnings.forEach(warn)
    stylesheet = r.value
  }

  const fallbackTarget: FxTarget = { type: "canvas" }
  return {
    baseWidth: numOr(raw.baseWidth, prev.baseWidth),
    baseHeight: numOr(raw.baseHeight, prev.baseHeight),
    format: typeof raw.format === "string" ? raw.format : prev.format,
    background:
      typeof raw.background === "string" ? raw.background : prev.background,
    theme,
    stylesheet,
    root: raw.root ? rootedNode(raw.root, warn) : prev.root,
    animations: Array.isArray(raw.animations)
      ? raw.animations
          .map((t) => normalizeTrack(t, fallbackTarget, warn))
          .filter((t): t is AnimTrack => !!t)
      : prev.animations,
    effects: Array.isArray(raw.effects)
      ? raw.effects
          .map((l) => normalizeLayer(l, fallbackTarget, warn))
          .filter((l): l is EffectLayer => !!l)
      : prev.effects,
    timeline: {
      duration: numOr(raw.timeline?.duration, prev.timeline.duration),
      fps: 30,
    },
  }
}

/** The applied root must be a full-canvas container with the stable 'root' id. */
function rootedNode(raw: Partial<SceneNode>, warn: Warn): SceneNode {
  const n = normalizeNode(raw, warn)
  if (n.id !== "root") {
    // An agent handing us a content node as root: wrap it.
    if (n.role && n.role !== "group") {
      warn("wrapped non-group root in a full-canvas container")
      return makeNode({
        id: "root",
        role: "group",
        layout: {
          mode: "absolute",
          anchor: "top-left",
          dx: 0,
          dy: 0,
          width: 1,
          height: 1,
        },
        children: [n],
      })
    }
    n.id = "root"
  }
  n.layout = {
    mode: "absolute",
    anchor: "top-left",
    dx: 0,
    dy: 0,
    width: 1,
    height: 1,
  }
  return n
}

export { DEFAULT_THEME }
