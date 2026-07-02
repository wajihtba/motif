// Animation presets — the engine-driven motion vocabulary for the animation layer.
//
// CSS animation does NOT paint inside HTML-in-Canvas, so motion is evaluated per
// frame by the renderer's animator. A preset is pure data + an `eval` that maps
// (time, params) → a partial AnimState delta. Presets are the agent-trivial,
// UI-mirrorable primary path; the AnimTrack.tracks[] keyframe escape hatch reuses
// the same AnimState shape for bespoke motion.

import type { EffectParam } from "../core/types"

/** A per-frame animation delta applied around a node's paint. Offsets in px;
 *  scale multiplicative; rotate in radians; opacity multiplicative (0..1). */
export interface AnimState {
  opacity: number
  x: number
  y: number
  scale: number
  rotate: number
}

export const IDENTITY: AnimState = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
}

export interface AnimPreset {
  id: string
  name: string
  group: "Entrance" | "Ambient" | "Emphasis"
  blurb?: string
  /** Ambient presets loop forever; entrance/emphasis are one-shot (settle, then idle). */
  ambient: boolean
  params: EffectParam[]
  /** `t` seconds since play; `dur` of the active one-shot window (engine handles looping). */
  eval: (t: number, p: Record<string, number>) => Partial<AnimState>
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}
const TAU = Math.PI * 2

const D = (
  def: number,
  min = 0,
  max = 3,
  step = 0.05
): Omit<EffectParam, "key" | "label"> => ({
  min,
  max,
  step,
  def,
})

export const ANIM_PRESETS: AnimPreset[] = [
  // --- entrance (one-shot) -------------------------------------------------
  {
    id: "fadeIn",
    name: "Fade In",
    group: "Entrance",
    ambient: false,
    params: [
      { key: "duration", label: "Duration (s)", ...D(0.6, 0.1, 4) },
      { key: "delay", label: "Delay (s)", ...D(0, 0, 4) },
    ],
    eval: (t, p) => {
      const prog = easeOut((t - (p.delay ?? 0)) / (p.duration || 0.6))
      return { opacity: prog }
    },
  },
  {
    id: "riseIn",
    name: "Rise In",
    group: "Entrance",
    blurb: "Fade + slide up into place.",
    ambient: false,
    params: [
      { key: "duration", label: "Duration (s)", ...D(0.7, 0.1, 4) },
      { key: "delay", label: "Delay (s)", ...D(0, 0, 4) },
      { key: "distance", label: "Distance (px)", ...D(40, 0, 300, 1) },
    ],
    eval: (t, p) => {
      const prog = easeOut((t - (p.delay ?? 0)) / (p.duration || 0.7))
      return { opacity: prog, y: (1 - prog) * (p.distance ?? 40) }
    },
  },
  {
    id: "slideIn",
    name: "Slide In",
    group: "Entrance",
    blurb: "Slide in from the left.",
    ambient: false,
    params: [
      { key: "duration", label: "Duration (s)", ...D(0.7, 0.1, 4) },
      { key: "delay", label: "Delay (s)", ...D(0, 0, 4) },
      { key: "distance", label: "Distance (px)", ...D(80, 0, 600, 1) },
    ],
    eval: (t, p) => {
      const prog = easeOut((t - (p.delay ?? 0)) / (p.duration || 0.7))
      return { opacity: prog, x: (prog - 1) * (p.distance ?? 80) }
    },
  },
  {
    id: "popIn",
    name: "Pop In",
    group: "Entrance",
    blurb: "Scale up with a slight overshoot.",
    ambient: false,
    params: [
      { key: "duration", label: "Duration (s)", ...D(0.55, 0.1, 3) },
      { key: "delay", label: "Delay (s)", ...D(0, 0, 4) },
    ],
    eval: (t, p) => {
      const x = clamp01((t - (p.delay ?? 0)) / (p.duration || 0.55))
      const overshoot =
        1 + 2.2 * Math.pow(1 - x, 2) * Math.sin(x * Math.PI * 1.5)
      return {
        opacity: easeOut(x),
        scale: x <= 0 ? 0.6 : 0.6 + 0.4 * x * overshoot,
      }
    },
  },
  // --- ambient (loop) ------------------------------------------------------
  {
    id: "float",
    name: "Float",
    group: "Ambient",
    ambient: true,
    params: [
      { key: "amp", label: "Amplitude (px)", ...D(8, 0, 60, 1) },
      { key: "speed", label: "Speed", ...D(1, 0.1, 4) },
    ],
    eval: (t, p) => ({ y: Math.sin(t * (p.speed ?? 1) * 1.4) * (p.amp ?? 8) }),
  },
  {
    id: "pulse",
    name: "Pulse",
    group: "Ambient",
    ambient: true,
    params: [
      { key: "amp", label: "Amount", ...D(0.05, 0, 0.4) },
      { key: "speed", label: "Speed", ...D(1.5, 0.1, 5) },
    ],
    eval: (t, p) => ({
      scale: 1 + Math.sin(t * (p.speed ?? 1.5) * 2) * (p.amp ?? 0.05),
    }),
  },
  {
    id: "spin",
    name: "Spin",
    group: "Ambient",
    ambient: true,
    params: [{ key: "speed", label: "Speed", ...D(1, 0.05, 4) }],
    eval: (t, p) => ({ rotate: t * (p.speed ?? 1) }),
  },
  {
    id: "sway",
    name: "Sway",
    group: "Ambient",
    ambient: true,
    params: [
      { key: "amp", label: "Amount (rad)", ...D(0.08, 0, 0.6) },
      { key: "speed", label: "Speed", ...D(1, 0.1, 4) },
    ],
    eval: (t, p) => ({
      rotate: Math.sin(t * (p.speed ?? 1) * 1.6) * (p.amp ?? 0.08),
    }),
  },
  // --- emphasis (one-shot, periodic via loop) -----------------------------
  {
    id: "heartbeat",
    name: "Heartbeat",
    group: "Emphasis",
    ambient: true,
    params: [
      { key: "amp", label: "Amount", ...D(0.12, 0, 0.5) },
      { key: "speed", label: "Speed", ...D(1.2, 0.2, 4) },
    ],
    eval: (t, p) => ({
      scale:
        1 +
        Math.pow(Math.max(0, Math.sin(t * (p.speed ?? 1.2) * 2.2)), 6) *
          (p.amp ?? 0.12),
    }),
  },
]

export const animPreset = (id?: string): AnimPreset | undefined =>
  id ? ANIM_PRESETS.find((a) => a.id === id) : undefined

export function presetDefaults(preset: AnimPreset): Record<string, number> {
  const o: Record<string, number> = {}
  for (const p of preset.params) o[p.key] = p.def
  return o
}

/** A nominal loop period (s) for a one-shot preset so previews replay it. */
export function presetPeriod(
  preset: AnimPreset,
  p: Record<string, number>
): number {
  if (preset.ambient) return TAU // ambient presets are inherently periodic
  const dur = (p.duration ?? 0.6) + (p.delay ?? 0)
  return dur + 1.4 // hold, then replay
}
