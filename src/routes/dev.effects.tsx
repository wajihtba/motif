// /dev/effects — the M3 verify harness (dev builds only). A demo scene with
// a "run all" sweep: every registered effect is applied through the real
// controller (fx.add), a frame renders, the canvas is sampled non-blank, and
// the layer is removed — pass/fail per effect. Plus a picker for eyeballing
// individual effects. window.__effectsSweep holds the machine-readable result.

import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { EffectKind } from "@/effects/core/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UnsupportedGate } from "@/components/editor/UnsupportedGate"
import { EditorController } from "@/controller"
import { setGlslValidator } from "@/controller/normalize"
import { detectCapabilities } from "@/engine/backend"
import { HtmlCanvasBackend } from "@/engine/html-canvas"
import { allEffects } from "@/effects/core/registry"
import "@/effects"
import { starterDocument } from "@/content/starter"

export const Route = createFileRoute("/dev/effects")({ component: DevEffects })

interface SweepRow {
  kind: EffectKind
  id: string
  ok: boolean
  note: string
}

declare global {
  interface Window {
    __effectsSweep?: { done: boolean; rows: SweepRow[] }
  }
}

const SWEEP_KINDS: EffectKind[] = [
  "scene-shader",
  "element-shader",
  "pixel",
  "filter",
]

function DevEffects() {
  const host = useRef<HTMLDivElement>(null)
  const ctrlRef = useRef<EditorController | null>(null)
  const backendRef = useRef<HtmlCanvasBackend | null>(null)
  const [caps, setCaps] = useState<ReturnType<typeof detectCapabilities> | null>(null)
  const [rows, setRows] = useState<SweepRow[]>([])
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setCaps(detectCapabilities())
  }, [])

  useEffect(() => {
    if (!caps?.liveCanvas || !host.current) return
    const ctrl = new EditorController(starterDocument("Effects gallery"))
    const backend = new HtmlCanvasBackend()
    backend.mount(host.current)
    ctrl.attachBackend(backend)
    setGlslValidator((kind, frag) => backend.validateGlsl(kind, frag))
    ctrlRef.current = ctrl
    backendRef.current = backend
    return () => {
      setGlslValidator(null)
      backend.dispose()
    }
  }, [caps])

  const sweep = async () => {
    const ctrl = ctrlRef.current
    const backend = backendRef.current
    if (!ctrl || !backend || running) return
    setRunning(true)
    window.__effectsSweep = { done: false, rows: [] }
    const out: SweepRow[] = []

    const canvas = backend.canvas
    const ctx = canvas.getContext("2d")!
    const sample = () => {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let opaque = 0
      for (let i = 3; i < d.length; i += 8000) if (d[i] > 8) opaque++
      return opaque
    }
    const settle = () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )

    await backend.whenIdle()
    for (const kind of SWEEP_KINDS) {
      for (const def of allEffects([kind])) {
        const target =
          kind === "scene-shader"
            ? { type: "canvas" as const }
            : { type: "elements" as const, ids: ["hero"] }
        const add = ctrl.dispatch({
          command: "fx.add",
          args: {
            effect: def.id,
            kind,
            target,
            ...(def.id === "custom" && {
              frag: "vec4 fx(){ vec4 c = texture2D(u_tex, v_uv); return vec4(1.0 - c.rgb, c.a); }",
            }),
          },
        })
        let ok = add.ok
        let note = add.ok ? "" : add.errors.join("; ")
        if (add.ok) {
          await settle()
          backend.renderFrame(0.5)
          const opaque = sample()
          ok = opaque > 10
          if (!ok) note = `blank frame (opaque=${opaque})`
          const id = add.returns[0] as string
          ctrl.dispatch({ command: "fx.remove", args: { id } })
        }
        out.push({ kind, id: def.id, ok, note })
        setRows([...out])
      }
    }
    window.__effectsSweep = { done: true, rows: out }
    setRunning(false)
  }

  if (!import.meta.env.DEV) {
    return <p className="p-6 text-sm">Dev harness — development builds only.</p>
  }
  if (!caps) return null
  if (!caps.liveCanvas) return <UnsupportedGate />

  const failed = rows.filter((r) => !r.ok)

  return (
    <div className="min-h-svh bg-background p-6 text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide uppercase">
          Effects gallery
        </h1>
        <Button size="sm" onClick={sweep} disabled={running}>
          {running ? "Sweeping…" : "Run full catalog sweep"}
        </Button>
        {rows.length > 0 && (
          <Badge variant={failed.length ? "destructive" : "default"}>
            {rows.length - failed.length}/{rows.length} pass
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div
          className="overflow-hidden rounded-lg border"
          style={{ width: 1080 * 0.4, height: 1080 * 0.4 }}
        >
          <div
            ref={host}
            style={{ transform: "scale(0.4)", transformOrigin: "top left" }}
          />
        </div>

        <div className="max-h-[80vh] min-w-72 overflow-y-auto">
          <table className="text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`} className="border-b border-border/40">
                  <td className="py-0.5 pr-2">
                    <Badge
                      variant={r.ok ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {r.ok ? "ok" : "fail"}
                    </Badge>
                  </td>
                  <td className="pr-3 font-mono">{r.id}</td>
                  <td className="pr-3 text-muted-foreground">{r.kind}</td>
                  <td className="text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
