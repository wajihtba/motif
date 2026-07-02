// /dev/engine — the M0 verify harness (dev builds only).
//
// Left: the engine painting a hardcoded 3-unit scene (root + two extracted
// units). Right: the same tree rendered as plain DOM for eyeball pixel parity.
// Toggles drive a hardcoded sampler to prove per-unit transform independence
// at 60fps; the conformance self-test report renders below.

import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { ConformanceCase } from "@/engine/conformance"
import type { Scene } from "@/scene/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { UnsupportedGate } from "@/components/editor/UnsupportedGate"
import { detectCapabilities } from "@/engine/backend"
import { runConformance } from "@/engine/conformance"
import { HtmlCanvasBackend } from "@/engine/html-canvas"
import { buildNodeEl } from "@/engine/html-canvas/build"
import { emptyScene, node, rootNode } from "@/scene/model"
import { themeVars } from "@/scene/theme"

export const Route = createFileRoute("/dev/engine")({ component: DevEngine })

/** Hardcoded 1080² demo: root unit + headline unit (float) + badge unit (spin). */
function demoScene(): Scene {
  const scene = emptyScene(1080, 1080, "ig-post")
  scene.background =
    "radial-gradient(120% 90% at 20% 10%, #1d1440 0%, #0a0a0f 60%)"
  scene.root = rootNode([
    node({
      id: "hero",
      role: "image",
      layout: {
        mode: "absolute",
        anchor: "center",
        dx: 0,
        dy: 0.04,
        width: 0.62,
        height: 0.46,
      },
      css: {
        background:
          "linear-gradient(135deg, oklch(0.67 0.18 281) 0%, oklch(0.62 0.2 350) 100%)",
        borderRadius: "28px",
        boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
      },
    }),
    node({
      id: "headline",
      role: "headline",
      html: "Spring <em>Sale</em>",
      layout: {
        mode: "absolute",
        anchor: "top-center",
        dx: 0,
        dy: 0.1,
        width: "auto",
        height: "auto",
      },
      css: {
        fontFamily: "var(--font-heading)",
        fontSize: "104px",
        fontWeight: "700",
        color: "var(--ink)",
        whiteSpace: "nowrap",
        letterSpacing: "-0.02em",
      },
    }),
    node({
      id: "subhead",
      role: "subhead",
      html: "Up to 30% off everything, this weekend only.",
      layout: {
        mode: "absolute",
        anchor: "top-center",
        dx: 0,
        dy: 0.225,
        width: "auto",
        height: "auto",
      },
      css: {
        fontFamily: "var(--font-body)",
        fontSize: "34px",
        color: "var(--muted)",
        whiteSpace: "nowrap",
      },
    }),
    node({
      id: "badge",
      role: "badge",
      html: "−30%",
      layout: {
        mode: "absolute",
        anchor: "top-right",
        dx: -0.06,
        dy: 0.06,
        width: 0.16,
        height: 0.16,
      },
      css: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--accent)",
        color: "#1a1206",
        fontFamily: "var(--font-body)",
        fontWeight: "800",
        fontSize: "44px",
        borderRadius: "50%",
        boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
      },
    }),
    node({
      id: "cta",
      role: "cta",
      html: "Shop now",
      layout: {
        mode: "absolute",
        anchor: "bottom-center",
        dx: 0,
        dy: -0.09,
        width: "auto",
        height: "auto",
      },
      css: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        fontFamily: "var(--font-body)",
        fontWeight: "700",
        fontSize: "34px",
        padding: "22px 56px",
        borderRadius: "999px",
      },
    }),
  ])
  // These tracks make headline + badge unit roots (the sampler below moves
  // them; the real animator arrives in M4).
  scene.animations = [
    {
      id: "a-float",
      target: { type: "elements", ids: ["headline"] },
      enabled: true,
      preset: "float",
      loop: true,
    },
    {
      id: "a-spin",
      target: { type: "elements", ids: ["badge"] },
      enabled: true,
      preset: "spin",
      loop: true,
    },
  ]
  return scene
}

const SCALE = 0.42

function DevEngine() {
  const stageHost = useRef<HTMLDivElement>(null)
  const domHost = useRef<HTMLDivElement>(null)
  const backendRef = useRef<HtmlCanvasBackend | null>(null)
  const [caps, setCaps] = useState<ReturnType<
    typeof detectCapabilities
  > | null>(null)
  const [cases, setCases] = useState<ConformanceCase[]>([])
  const [animate, setAnimate] = useState(false)
  const [fps, setFps] = useState(0)
  const [info, setInfo] = useState("")

  useEffect(() => {
    setCaps(detectCapabilities())
  }, [])

  // Mount the engine + the plain-DOM comparison host.
  useEffect(() => {
    if (!caps?.liveCanvas || !stageHost.current) return
    const backend = new HtmlCanvasBackend()
    backendRef.current = backend
    backend.mount(stageHost.current)
    const scene = demoScene()
    backend.setScene(scene)
    void backend
      .whenIdle()
      .then(() => setInfo(JSON.stringify(backend.debugInfo())))

    // DOM comparison host: same tree, same theme, plain rendering.
    if (domHost.current) {
      const wrap = document.createElement("div")
      Object.assign(wrap.style, {
        position: "relative",
        width: `${scene.baseWidth}px`,
        height: `${scene.baseHeight}px`,
        background: scene.background,
        overflow: "hidden",
      })
      for (const [k, v] of Object.entries(themeVars(scene.theme))) {
        wrap.style.setProperty(k, v)
      }
      wrap.appendChild(buildNodeEl(scene.root, {}))
      domHost.current.replaceChildren(wrap)
    }

    void runConformance().then((r) => {
      setCases(r)
      console.table(r.map(({ id, status, detail }) => ({ id, status, detail })))
    })
    return () => {
      backend.dispose()
      backendRef.current = null
    }
  }, [caps])

  // Hardcoded per-unit sampler — proves independent unit transforms.
  useEffect(() => {
    const backend = backendRef.current
    if (!backend) return
    if (!animate) {
      backend.setSampler(null)
      backend.setContinuous(false)
      setFps(0)
      return
    }
    backend.setSampler((t, unitId) => {
      if (unitId === "badge") {
        return {
          x: 0,
          y: 0,
          scale: 1 + 0.06 * Math.sin(t * 3),
          rotate: (t * 45) % 360,
          opacity: 1,
        }
      }
      if (unitId === "headline") {
        return {
          x: 0,
          y: 14 * Math.sin(t * 1.6),
          scale: 1,
          rotate: 0,
          opacity: 1,
        }
      }
      return null
    })
    backend.setContinuous(true)

    let frames = 0
    let last = performance.now()
    let raf = 0
    const meter = (now: number) => {
      frames += 1
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(meter)
    }
    raf = requestAnimationFrame(meter)
    return () => cancelAnimationFrame(raf)
  }, [animate])

  if (!import.meta.env.DEV) {
    return <p className="p-6 text-sm">Dev harness — development builds only.</p>
  }
  if (!caps) return null
  if (!caps.liveCanvas) return <UnsupportedGate />

  const scaledBox = { width: 1080 * SCALE, height: 1080 * SCALE }

  return (
    <div className="min-h-svh bg-background p-6 text-foreground">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-sm font-semibold tracking-wide uppercase">
          Engine harness
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={animate} onCheckedChange={setAnimate} />
          animate units
        </label>
        {animate && <Badge variant="outline">{fps} fps</Badge>}
        <Badge variant="outline">{info || "…"}</Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => backendRef.current?.invalidate()}
        >
          repaint
        </Button>
      </div>

      <div className="flex flex-wrap gap-6">
        <figure>
          <figcaption className="mb-1 text-xs text-muted-foreground">
            engine (canvas)
          </figcaption>
          <div className="overflow-hidden rounded-lg border" style={scaledBox}>
            <div
              ref={stageHost}
              style={{
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs text-muted-foreground">
            plain DOM (reference)
          </figcaption>
          <div className="overflow-hidden rounded-lg border" style={scaledBox}>
            <div
              ref={domHost}
              style={{
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </figure>
      </div>

      <section className="mt-6 max-w-2xl">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Conformance self-test
        </h2>
        <ul className="space-y-1">
          {cases.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <Badge
                variant={
                  c.status === "pass"
                    ? "default"
                    : c.status === "fail"
                      ? "destructive"
                      : "secondary"
                }
              >
                {c.status}
              </Badge>
              <span className="font-mono text-xs">{c.id}</span>
              <span className="text-xs text-muted-foreground">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
