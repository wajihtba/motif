// The animator — engine-driven motion, sampled per frame (CSS animation does
// not paint inside HTML-in-Canvas). v2 is SECONDS-BASED and DETERMINISTIC:
// tracks occupy [start, start+duration] windows on the document timeline and
// sampleAt(t) is a pure function — same t, same numbers — which is what makes
// scrubbing exact and video export frame-stable (docs/plan/02-performance.md).
//
// Combination rule (kept from v1): opacity & scale multiply, x/y/rotate add.
// Presets return rotate in radians; UnitSample carries degrees.

import type { AnimChannel, AnimTrack, Scene } from "../scene/types"
import type { UnitSample } from "./backend"
import { animPreset, presetDefaults } from "../effects/anims/presets"
import { nodesByRole } from "../scene/model"

interface CompiledTrack {
  track: AnimTrack
  /** Window start including this target's stagger offset. */
  start: number
  /** Window length (Infinity for ambient loops). */
  duration: number
  loop: boolean
  params: Record<string, number>
}

export interface CompiledAnimations {
  byUnit: Map<string, CompiledTrack[]>
  /** True when any track exists (units split; playback is meaningful). */
  active: boolean
}

/** Default one-shot window when neither the track nor its params say. */
const DEFAULT_ONESHOT = 1
/** Ambient tracks run for the whole timeline. */
const AMBIENT = Number.POSITIVE_INFINITY

export function compileAnimations(scene: Scene): CompiledAnimations {
  const byUnit = new Map<string, CompiledTrack[]>()
  for (const track of scene.animations) {
    if (!track.enabled) continue
    const ids = targetIds(scene, track)
    if (!ids.length) continue

    const preset = animPreset(track.preset)
    const params = preset
      ? { ...presetDefaults(preset), ...track.params }
      : { ...track.params }
    const ambient = preset?.ambient ?? false
    const loop = track.loop ?? ambient
    const delay = typeof params.delay === "number" ? params.delay : 0
    const naturalDur =
      typeof params.duration === "number" && params.duration > 0
        ? params.duration + delay
        : DEFAULT_ONESHOT
    const duration = track.duration ?? (loop ? AMBIENT : naturalDur)
    const stagger = track.stagger ?? 0

    ids.forEach((id, order) => {
      let list = byUnit.get(id)
      if (!list) {
        list = []
        byUnit.set(id, list)
      }
      list.push({
        track,
        start: (track.start ?? 0) + stagger * order,
        duration,
        loop,
        params,
      })
    })
  }
  return { byUnit, active: byUnit.size > 0 }
}

/** Deterministic sample of a unit's motion state at time t (seconds). */
export function sampleAt(
  compiled: CompiledAnimations,
  t: number,
  unitId: string
): UnitSample | null {
  const tracks = compiled.byUnit.get(unitId)
  if (!tracks?.length) return null

  let opacity = 1
  let scale = 1
  let x = 0
  let y = 0
  let rotateRad = 0

  for (const c of tracks) {
    let local = t - c.start
    if (Number.isFinite(c.duration)) {
      if (c.loop && c.duration > 0) {
        local = ((local % c.duration) + c.duration) % c.duration
      } else {
        local = Math.min(Math.max(local, 0), c.duration)
      }
    } else if (local < 0) {
      local = 0
    }

    const state = evalTrack(c, local)
    if (state.opacity != null) opacity *= clamp01(state.opacity)
    if (state.scale != null) scale *= state.scale
    if (state.x != null) x += state.x
    if (state.y != null) y += state.y
    if (state.rotate != null) rotateRad += state.rotate
  }

  return {
    opacity,
    scale,
    x,
    y,
    rotate: (rotateRad * 180) / Math.PI,
  }
}

function evalTrack(
  c: CompiledTrack,
  local: number
): Partial<{
  opacity: number
  scale: number
  x: number
  y: number
  rotate: number
}> {
  const preset = animPreset(c.track.preset)
  if (preset) return preset.eval(local, c.params)
  if (c.track.tracks?.length) {
    return evalKeyframes(c.track.tracks, local, c.duration)
  }
  return {}
}

/** The keyframe escape hatch: channels with frames at t 0..1 within the
 *  window, linearly interpolated with optional per-frame easing. */
function evalKeyframes(
  channels: AnimChannel[],
  local: number,
  duration: number
): Partial<Record<"opacity" | "x" | "y" | "scale" | "rotate", number>> {
  const dur =
    Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_ONESHOT
  const nt = clamp01(local / dur)
  const out: Partial<
    Record<"opacity" | "x" | "y" | "scale" | "rotate", number>
  > = {}
  for (const ch of channels) {
    if (!ch.frames.length) continue
    out[ch.prop] = sampleChannel(ch, nt)
  }
  return out
}

function sampleChannel(ch: AnimChannel, nt: number): number {
  const frames = ch.frames
  if (nt <= frames[0].t) return frames[0].v
  const last = frames[frames.length - 1]
  if (nt >= last.t) return last.v
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (nt >= a.t && nt <= b.t) {
      const span = b.t - a.t || 1
      const raw = (nt - a.t) / span
      return a.v + (b.v - a.v) * ease(b.ease, raw)
    }
  }
  return last.v
}

function ease(name: string | undefined, x: number): number {
  switch (name) {
    case "easeIn":
      return x * x * x
    case "easeOut":
      return 1 - Math.pow(1 - x, 3)
    case "easeInOut":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    default:
      return x
  }
}

function targetIds(scene: Scene, track: AnimTrack): string[] {
  if (track.target.type === "elements") return track.target.ids
  if (track.target.type === "role") {
    return nodesByRole(scene, track.target.role).map((n) => n.id)
  }
  return []
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
