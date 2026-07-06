// The motion preview stage: three brand-styled elements (heading bar, card,
// CTA pill) animated by the SAME preset math the renderer runs — presets are
// pure (t, params) → AnimState functions, so a tiny rAF loop here previews
// exactly what the engine will play. Entrance staggers across the elements,
// ambient/emphasis overlay after the entrance settles, and any motion change
// auto-replays. While the stagger slider is dragged (`liveStagger` set) the
// entrance loops continuously — stagger is only visible as a cascade — and
// the drag value is read per-frame from a ref so dragging never resets the
// clock. Honors prefers-reduced-motion: settled frame, replay on button only.

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import type { BrandMotion } from "@/brand/types"
import { PACE_SCALE } from "@/brand/types"
import type { AnimState } from "@/effects/anims/presets"
import { IDENTITY, animPreset, presetDefaults } from "@/effects/anims/presets"
import { Button } from "@/components/ui/button"

const ELEMENT_COUNT = 3
/** Keep looping this long after the last entrance settles, then park (only
 *  when nothing ambient/emphasis keeps the stage alive). */
const SETTLE_HOLD_S = 0.4
/** Pause between cascade replays in loop (stagger-drag) mode. */
const LOOP_GAP_S = 0.9

/** Merge an eval delta onto a state per AnimState semantics: offsets add,
 *  scale/opacity multiply, rotation adds. */
function compose(base: AnimState, delta: Partial<AnimState>): AnimState {
  return {
    opacity: base.opacity * (delta.opacity ?? 1),
    x: base.x + (delta.x ?? 0),
    y: base.y + (delta.y ?? 0),
    scale: base.scale * (delta.scale ?? 1),
    rotate: base.rotate + (delta.rotate ?? 0),
  }
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function MotionStage({
  motion,
  tokens,
  previewEntrance,
  liveStagger,
}: {
  motion: BrandMotion
  /** Brand theme tokens — the stage renders in the brand's own colors. */
  tokens: Record<string, string>
  /** Hover-preview override for the entrance select; null = none. */
  previewEntrance?: string | null
  /** Set while the stagger slider drags — loops the cascade live. */
  liveStagger?: number | null
}) {
  const els = useRef<(HTMLDivElement | null)[]>([])
  const raf = useRef(0)
  const start = useRef(0)
  const [replayTick, setReplayTick] = useState(0)
  const reduced = prefersReducedMotion()

  const entranceId = previewEntrance ?? motion.entrance ?? "riseIn"
  const pace = motion.pace ?? "standard"
  const ambient = motion.ambient ?? "subtle"
  const emphasisId = motion.emphasis
  const looping = liveStagger != null

  // Read per frame, never a dep: dragging must not reset the clock.
  const staggerRef = useRef(0.12)
  staggerRef.current = liveStagger ?? motion.stagger ?? 0.12

  useEffect(() => {
    const entrance = animPreset(entranceId)
    if (!entrance) return
    // Every entrance preset declares duration/delay params (0 when absent).
    const params = presetDefaults(entrance)
    params.duration = (params.duration || 0.6) * PACE_SCALE[pace]
    const settleAt = (params.delay || 0) + params.duration

    const float = animPreset("float")
    const sway = animPreset("sway")
    const emphasis = animPreset(emphasisId)
    const ambientEvals: ((t: number) => Partial<AnimState>)[] = []
    if (ambient === "subtle" && float)
      ambientEvals.push((t) => float.eval(t, { amp: 4, speed: 1 }))
    if (ambient === "lively" && float && sway) {
      ambientEvals.push((t) => float.eval(t, { amp: 8, speed: 1.2 }))
      ambientEvals.push((t) => sway.eval(t, { amp: 0.04, speed: 1 }))
    }
    const emphasisParams = emphasis ? presetDefaults(emphasis) : {}

    const applyFrame = (elapsed: number, entranceT: number) => {
      const stagger = staggerRef.current
      let allSettled = true
      for (let i = 0; i < ELEMENT_COUNT; i++) {
        const el = els.current[i]
        if (!el) continue
        const t = entranceT - i * stagger
        let state = compose(IDENTITY, entrance.eval(Math.max(t, 0), params))
        if (t < 0) state = { ...state, opacity: 0 }
        const settled = t >= settleAt
        if (!settled) allSettled = false
        if (settled) {
          // Ambient drifts every element; emphasis loops on the CTA only.
          for (const ev of ambientEvals) state = compose(state, ev(elapsed))
          if (emphasis && i === ELEMENT_COUNT - 1)
            state = compose(state, emphasis.eval(elapsed, emphasisParams))
        }
        el.style.opacity = String(state.opacity)
        el.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale}) rotate(${state.rotate}rad)`
      }
      return allSettled
    }

    // Reduced motion: paint the settled frame once; the replay button
    // (bumping replayTick) still plays one run on explicit request.
    if (reduced && replayTick === 0 && !looping) {
      const settledT = settleAt + (ELEMENT_COUNT - 1) * staggerRef.current + 1
      applyFrame(settledT, settledT)
      return
    }

    start.current = performance.now()
    const keepAlive = ambientEvals.length > 0 || !!emphasis || looping
    const tick = () => {
      const elapsed = (performance.now() - start.current) / 1000
      const lastSettle = settleAt + (ELEMENT_COUNT - 1) * staggerRef.current
      // Loop mode replays the cascade continuously so the current stagger
      // value is always visible as rhythm, not a settled frame.
      const entranceT = looping ? elapsed % (lastSettle + LOOP_GAP_S) : elapsed
      const allSettled = applyFrame(elapsed, entranceT)
      if (!keepAlive && allSettled && elapsed > lastSettle + SETTLE_HOLD_S) {
        raf.current = 0
        return // park — nothing is moving anymore
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [entranceId, pace, ambient, emphasisId, looping, replayTick, reduced])

  const setEl = (i: number) => (el: HTMLDivElement | null) => {
    els.current[i] = el
  }

  return (
    <div
      className="canvas-well relative h-28 overflow-hidden rounded-lg border"
      style={{ background: tokens["--background"] }}
    >
      <div className="flex h-full flex-col items-start justify-center gap-2 px-4">
        <div
          ref={setEl(0)}
          className="h-3.5 w-32 rounded-sm"
          style={{ background: tokens["--ink"], opacity: 0 }}
        />
        <div
          ref={setEl(1)}
          className="h-6 w-44"
          style={{
            background: `color-mix(in srgb, ${tokens["--primary"] ?? "#888"} 30%, transparent)`,
            border: `1px solid ${tokens["--border"] ?? "rgba(255,255,255,0.16)"}`,
            borderRadius: tokens["--radius"],
            boxShadow: tokens["--shadow"],
            opacity: 0,
          }}
        />
        <div
          ref={setEl(2)}
          className="flex h-6 items-center rounded-full px-3 text-[10px] font-semibold"
          style={{
            background: tokens["--primary"],
            color: tokens["--primary-foreground"],
            borderRadius: tokens["--radius"],
            opacity: 0,
          }}
        >
          CTA
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Replay motion preview"
        className="absolute top-1.5 right-1.5 h-6 px-1.5 text-muted-foreground"
        onClick={() => setReplayTick((n) => n + 1)}
      >
        <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
      </Button>
    </div>
  )
}
