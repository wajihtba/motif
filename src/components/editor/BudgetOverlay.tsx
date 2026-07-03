// Dev budget overlay — live fps / frame-time / paint-unit stats from the
// backend, sampled on a rAF loop while visible. Toggled from the ⌘K palette;
// exists so "is the frame budget holding" is a glance, not a profile.

import { useEffect, useState } from "react"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"

export function BudgetOverlay({ backend }: { backend: HtmlCanvasBackend }) {
  const [stats, setStats] = useState({
    fps: 0,
    frameMs: 0,
    units: 0,
    isolated: 0,
    idle: true,
  })

  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    let windowStart = last
    let worst = 0
    const tick = () => {
      const now = performance.now()
      worst = Math.max(worst, now - last)
      last = now
      frames += 1
      if (now - windowStart >= 500) {
        const info = backend.debugInfo()
        setStats({
          fps: Math.round((frames * 1000) / (now - windowStart)),
          frameMs: Math.round(worst * 10) / 10,
          units: info.units,
          isolated: info.isolated,
          idle: info.idle,
        })
        frames = 0
        worst = 0
        windowStart = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [backend])

  return (
    <div
      data-motif="budget-overlay"
      className="pointer-events-none absolute right-3 bottom-3 z-20 rounded-md border bg-background/85 px-2.5 py-1.5 font-mono text-[11px] leading-4 backdrop-blur"
    >
      <div className={stats.fps < 50 && !stats.idle ? "text-destructive" : ""}>
        {stats.idle ? "idle" : `${stats.fps} fps`} · worst {stats.frameMs}ms
      </div>
      <div className="text-muted-foreground">
        {stats.units} units · {stats.isolated} isolated
      </div>
    </div>
  )
}
