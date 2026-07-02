// /dev/anim — the M4 verify harness (dev builds only): the 02-performance
// budget scene (2 animated units + 1 animated scene shader at 1080²), an fps
// bench, and a scrub-determinism check. window.__animBench carries results.

import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UnsupportedGate } from "@/components/editor/UnsupportedGate"
import { EditorController } from "@/controller"
import { detectCapabilities } from "@/engine/backend"
import { HtmlCanvasBackend } from "@/engine/html-canvas"
import { starterDocument } from "@/content/starter"

export const Route = createFileRoute("/dev/anim")({ component: DevAnim })

interface Bench {
  fps: number
  avgMs: number
  maxMs: number
  deterministic: boolean
  done: boolean
}

interface ExportBench {
  ms: number
  bytes: number
  container: string
  frames: number
  deterministic: boolean
  error?: string
  done: boolean
}

declare global {
  interface Window {
    __animBench?: Bench
    __exportBench?: ExportBench
  }
}

function DevAnim() {
  const host = useRef<HTMLDivElement>(null)
  const backendRef = useRef<HtmlCanvasBackend | null>(null)
  const ctrlRef = useRef<EditorController | null>(null)
  const [caps, setCaps] = useState<ReturnType<
    typeof detectCapabilities
  > | null>(null)
  const [bench, setBench] = useState<Bench | null>(null)
  const [exportBench, setExportBench] = useState<ExportBench | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setCaps(detectCapabilities())
  }, [])

  useEffect(() => {
    if (!caps?.liveCanvas || !host.current) return
    const ctrl = new EditorController(starterDocument("Anim bench"))
    ctrlRef.current = ctrl
    const backend = new HtmlCanvasBackend()
    backend.mount(host.current)
    ctrl.attachBackend(backend)
    // Budget scene: two animated units + one animated scene shader.
    ctrl.dispatch([
      {
        command: "anim.add",
        args: {
          preset: "float",
          target: { type: "elements", ids: ["headline"] },
        },
      },
      {
        command: "anim.add",
        args: { preset: "spin", target: { type: "elements", ids: ["badge"] } },
      },
      {
        command: "fx.add",
        args: { effect: "vhs", kind: "scene-shader", animate: true },
      },
    ])
    backendRef.current = backend
    return () => backend.dispose()
  }, [caps])

  const run = async () => {
    const backend = backendRef.current
    if (!backend || running) return
    setRunning(true)
    window.__animBench = undefined

    await backend.whenIdle()
    backend.play()

    // Measure ~3 seconds of playback.
    const frames: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const started = performance.now()
      const tick = (now: number) => {
        frames.push(now - last)
        last = now
        if (now - started < 3000) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    backend.pause()

    const avgMs = frames.reduce((a, b) => a + b, 0) / frames.length
    const maxMs = Math.max(...frames.slice(2))
    const fps = Math.round(1000 / avgMs)

    // Scrub determinism: the same t must produce identical pixels.
    const snap = () => {
      backend.renderFrame(1.5)
      return backend.canvas.toDataURL()
    }
    backend.seek(1.5)
    const a = snap()
    backend.seek(3.2)
    backend.renderFrame(3.2)
    backend.seek(1.5)
    const b = snap()
    const deterministic = a === b

    const result: Bench = { fps, avgMs, maxMs, deterministic, done: true }
    window.__animBench = result
    setBench(result)
    setRunning(false)
  }

  const runExport = async () => {
    if (running) return
    setRunning(true)
    window.__exportBench = undefined
    try {
      const { exportVideo } = await import("@/engine/export")
      const ctrl = ctrlRef.current!
      const scene = ctrl.store.state.document.scene
      const started = performance.now()
      const a = await exportVideo(scene)
      const ms = performance.now() - started
      const b = await exportVideo(scene) // determinism: same probe frame hash
      window.__exportBench = {
        ms: Math.round(ms),
        bytes: a.blob.size,
        container: a.container,
        frames: a.frames,
        deterministic: a.probeHash === b.probeHash && a.probeHash !== "",
        done: true,
      }
      setExportBench(window.__exportBench)
    } catch (e) {
      window.__exportBench = {
        ms: 0,
        bytes: 0,
        container: "",
        frames: 0,
        deterministic: false,
        error: (e as Error).message || String(e),
        done: true,
      }
      setExportBench(window.__exportBench)
    } finally {
      setRunning(false)
    }
  }

  if (!import.meta.env.DEV) {
    return <p className="p-6 text-sm">Dev harness — development builds only.</p>
  }
  if (!caps) return null
  if (!caps.liveCanvas) return <UnsupportedGate />

  return (
    <div className="min-h-svh bg-background p-6 text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide uppercase">
          Animation bench
        </h1>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? "Benching…" : "Run 3s bench + determinism check"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={runExport}
          disabled={running}
        >
          Export video bench
        </Button>
        {exportBench && (
          <Badge variant={exportBench.error ? "destructive" : "default"}>
            {exportBench.error ??
              `${exportBench.container} · ${exportBench.frames}f · ${(exportBench.bytes / 1e6).toFixed(1)}MB · ${(exportBench.ms / 1000).toFixed(1)}s${exportBench.deterministic ? " · deterministic" : " · NON-DET"}`}
          </Badge>
        )}
        {bench && (
          <>
            <Badge variant={bench.fps >= 55 ? "default" : "destructive"}>
              {bench.fps} fps
            </Badge>
            <Badge variant={bench.avgMs <= 8 ? "default" : "secondary"}>
              avg {bench.avgMs.toFixed(1)}ms
            </Badge>
            <Badge variant={bench.deterministic ? "default" : "destructive"}>
              {bench.deterministic ? "deterministic" : "NON-DETERMINISTIC"}
            </Badge>
          </>
        )}
      </div>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ width: 1080 * 0.45, height: 1080 * 0.45 }}
      >
        <div
          ref={host}
          style={{ transform: "scale(0.45)", transformOrigin: "top left" }}
        />
      </div>
    </div>
  )
}
