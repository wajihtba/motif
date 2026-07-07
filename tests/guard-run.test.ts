// runGuardPass — the agent-loop guard pass, driven headless against a real
// controller and a simulated measure backend: deterministic fixes apply and
// converge, the once-per-send churn guard stops repeat attempts, and the
// config switch keeps the pass warn-only.

import { describe, expect, it } from "vitest"
import type { Box } from "@/engine/backend"
import type { SceneNode } from "@/scene/types"
import type { GuardConfig } from "@/controller/guard/types"
import { DEFAULT_GUARD_CONFIG } from "@/controller/guard/types"
import { runGuardPass } from "@/controller/guard/run"
import { EditorController } from "@/controller"
import { findNode, node } from "@/scene/model"

const config = (patch: Partial<GuardConfig> = {}): GuardConfig => ({
  ...DEFAULT_GUARD_CONFIG,
  ...patch,
})

/** Real controller + simulated measurement: each node's box is its initial
 *  box translated by its CURRENT normalized dx/dy (initial layouts are
 *  dx:0/dy:0), which is exactly what a renderer would do with autofix's
 *  translation-only setLayout calls. Boxes follow dispatches — fixes "stick"
 *  unless `frozen` pins the world (simulating a fix the renderer ignored). */
function harness(
  children: SceneNode[],
  initBoxes: Record<string, Box | undefined>,
  opts: { frozen?: boolean } = {}
) {
  const ctrl = new EditorController()
  const r = ctrl.dispatch({
    command: "scene.apply",
    args: { root: { id: "root", role: "group", children } },
  })
  expect(r.ok).toBe(true)
  const dispatches: number[] = []
  const measure = (id: string): Box | null => {
    const init = initBoxes[id]
    if (!init) return null
    if (opts.frozen) return init
    const n = findNode(ctrl.store.state.document.scene, id)
    const layout = n?.layout as { dx?: number; dy?: number } | undefined
    return {
      x: init.x + (layout?.dx ?? 0) * 1080,
      y: init.y + (layout?.dy ?? 0) * 1080,
      w: init.w,
      h: init.h,
    }
  }
  const realDispatch = ctrl.dispatch.bind(ctrl)
  ctrl.dispatch = (calls, dopts) => {
    const res = realDispatch(calls, dopts)
    if (res.ok) dispatches.push(Array.isArray(calls) ? calls.length : 1)
    return res
  }
  return {
    ctrl,
    dispatches,
    backend: { measure, whenIdle: () => Promise.resolve() },
  }
}

const text = (id: string) =>
  node({ id, role: "headline", html: "Slow Roast Sunday" })

// Two text leaves colliding 40px deep — one free-space nudge resolves it.
const CHILDREN = () => [text("a"), text("b")]
const BOXES: Record<string, Box> = {
  a: { x: 100, y: 100, w: 400, h: 120 },
  b: { x: 120, y: 180, w: 400, h: 60 },
}

describe("runGuardPass", () => {
  it("fixes deterministically and returns no warnings once clean", async () => {
    const h = harness(CHILDREN(), BOXES)
    const result = await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({ agentAutofix: true }),
      fixAttempted: new Set(),
      contrastFixAttempted: new Set(),
    })
    expect(h.dispatches.length).toBeGreaterThan(0)
    expect(result.lines).toEqual([])
    expect(result.findings).toEqual([])
  })

  it("bumps lastSeenSeq via onFixed for every applied fix", async () => {
    const h = harness(CHILDREN(), BOXES)
    let fixed = 0
    await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({ agentAutofix: true }),
      fixAttempted: new Set(),
      contrastFixAttempted: new Set(),
      onFixed: () => fixed++,
    })
    expect(fixed).toBe(h.dispatches.length)
  })

  it("churn guard: a fix that does not stick is attempted once, then rides to the model", async () => {
    const h = harness(CHILDREN(), BOXES, { frozen: true })
    const fixAttempted = new Set<string>()
    const first = await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({ agentAutofix: true }),
      fixAttempted,
      contrastFixAttempted: new Set(),
    })
    expect(h.dispatches).toHaveLength(1)
    expect(first.lines.some((l) => l.includes("overlaps"))).toBe(true)

    // Same send(), next tool call: the attempted key blocks a re-dispatch.
    const second = await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({ agentAutofix: true }),
      fixAttempted,
      contrastFixAttempted: new Set(),
    })
    expect(h.dispatches).toHaveLength(1)
    expect(second.lines.some((l) => l.includes("overlaps"))).toBe(true)
  })

  it("agentAutofix off: warn-only, nothing dispatched", async () => {
    const h = harness(CHILDREN(), BOXES)
    const result = await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({ agentAutofix: false }),
      fixAttempted: new Set(),
      contrastFixAttempted: new Set(),
    })
    expect(h.dispatches).toHaveLength(0)
    expect(result.lines.some((l) => l.includes("overlaps"))).toBe(true)
  })

  it("disabled rules produce neither warnings nor fixes", async () => {
    const h = harness(CHILDREN(), BOXES)
    const result = await runGuardPass({
      ctrl: h.ctrl,
      backend: h.backend,
      config: config({
        agentAutofix: true,
        rules: { overlap: { enabled: false } },
      }),
      fixAttempted: new Set(),
      contrastFixAttempted: new Set(),
    })
    expect(h.dispatches).toHaveLength(0)
    expect(result.lines).toEqual([])
  })
})
