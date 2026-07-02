// The timeline bar: play/pause (Space), deterministic scrubber, duration.
// Playback is preview-only state on the backend — the document only stores
// timeline.duration (what the mp4 export will render, M5).

import { useEffect, useState } from "react"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { useEditorState } from "@/hooks/use-document-store"

const DURATIONS = [3, 5, 8, 10, 15]

export function Timeline({
  ctrl,
  backend,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
}) {
  const state = useEditorState(ctrl)
  const duration = state.document.scene.timeline.duration
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)

  // Poll the playhead while playing (the backend owns the clock).
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      setPlayhead(backend.playhead)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, backend])

  // Space toggles play/pause (outside text inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (
        e.code !== "Space" ||
        t.isContentEditable ||
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA"
      )
        return
      e.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [playing])

  const toggle = () => {
    if (backend.isPlaying) {
      backend.pause()
      setPlaying(false)
      setPlayhead(backend.playhead)
    } else {
      backend.play()
      setPlaying(true)
    }
  }

  const scrub = (t: number) => {
    backend.pause()
    setPlaying(false)
    backend.seek(t)
    setPlayhead(t)
  }

  return (
    <footer className="flex h-12 shrink-0 items-center gap-3 border-t bg-background px-3">
      <Button
        variant="outline"
        size="sm"
        className="w-9"
        onClick={toggle}
        title="Play/pause (Space)"
      >
        {playing ? "⏸" : "▶"}
      </Button>
      <span className="w-24 text-xs text-muted-foreground tabular-nums">
        {playhead.toFixed(1)}s / {duration.toFixed(1)}s
      </span>
      <Slider
        className="flex-1"
        min={0}
        max={duration}
        step={1 / 30}
        value={[Math.min(playhead, duration)]}
        onValueChange={([t]) => scrub(t)}
      />
      <Select
        value={String(duration)}
        onValueChange={(v) =>
          ctrl.dispatch({
            command: "timeline.set",
            args: { duration: Number(v) },
          })
        }
      >
        <SelectTrigger className="h-8 w-20 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DURATIONS.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}s
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[11px] text-muted-foreground">30 fps</span>
    </footer>
  )
}
