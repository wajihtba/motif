// Contrast check orchestration — tier 1 (style analysis, sync) plus tier 2
// (pixel sampling, async) behind one memoized entry point, so the agent loop
// and the editor overlay share a single sampling run per scene revision.
// Never throws: contrast is a warning channel, a failure must not break the
// tool loop or the overlay (same contract as lintAfterSettle).

import type { Box, ProbedStyle } from "../engine/backend"
import type { Scene } from "../scene/types"
import type { CommandCall, DispatchOptions } from "./dispatch"
import { cssColorToRgba } from "../lib/css-color"
import { sampleContrast } from "../engine/export/sample-contrast"
import { autofixContrast, isStyledInkFinding } from "./contrast-autofix"
import { lintContrast, verdictToFinding } from "./contrast-lint"
import type { ContrastFinding, StyleProbe } from "./contrast-lint"

export interface ContrastCheckDeps {
  scene: Scene
  measure: (id: string) => Box | null
  probe: StyleProbe
  /** Cache key — ctrl.history.lastSeq. A new dispatch invalidates the memo. */
  revision: number
}

let memo: {
  revision: number
  scene: Scene
  promise: Promise<ContrastFinding[]>
} | null = null

/** Full contrast findings for the settled scene. Callers must await settle
 *  (fonts ready + backend idle) before calling — boxes and computed styles
 *  must be fresh. Memoized (size 1) by revision + scene identity. */
export function lintContrastAfterSettle(
  deps: ContrastCheckDeps
): Promise<ContrastFinding[]> {
  if (memo && memo.revision === deps.revision && memo.scene === deps.scene) {
    return memo.promise
  }
  const promise: Promise<ContrastFinding[]> = run(deps).catch((e: unknown) => {
    // A transient failure (session mount, fonts, GL) must not be cached as
    // "clean" for this revision — drop the memo so the next settle retries.
    if (memo?.promise === promise) memo = null
    console.warn("contrast check failed:", e)
    return []
  })
  memo = { revision: deps.revision, scene: deps.scene, promise }
  return promise
}

async function run(deps: ContrastCheckDeps): Promise<ContrastFinding[]> {
  const { findings, deferred } = lintContrast(
    deps.scene,
    deps.measure,
    deps.probe,
    cssColorToRgba
  )
  if (!deferred.length) return findings
  const verdicts = await sampleContrast(deps.scene, deferred)
  for (const check of deferred) {
    const verdict = verdicts.get(check.id)
    if (!verdict) continue
    const finding = verdictToFinding(check, verdict)
    if (finding) findings.push(finding)
  }
  return findings
}

// --- one-shot fix session -----------------------------------------------------
//
// The BUTTON path — explicitly invoked, never reactive, and structurally
// unable to loop: each node gets at most two fix attempts (its normal ladder
// rung, then the terminal halo escalation; effect-styled ink starts terminal,
// so it gets one). A node still failing after its budget is left flagged for
// the human/LLM — the session ends in a stable state instead of churning.

const FIX_SESSION_PASSES = 3

/** What the fix session needs from the controller — structural, so this
 *  module doesn't import the controller barrel. */
export interface FixSessionCtrl {
  dispatch: (calls: CommandCall[], opts?: DispatchOptions) => { ok: boolean }
  history: { lastSeq: number }
  store: { state: { document: { scene: Scene } } }
}

export interface FixSessionBackend {
  measure: (id: string) => Box | null
  probeStyle?: (id: string) => ProbedStyle | null
  whenIdle: () => Promise<void>
}

export interface ContrastFixSessionResult {
  /** Nodes the session dispatched at least one fix for. */
  attempted: number
  /** Findings still present after the session settled — hand these to the LLM. */
  remaining: ContrastFinding[]
}

export async function runContrastFixSession(deps: {
  ctrl: FixSessionCtrl
  backend: FixSessionBackend
}): Promise<ContrastFixSessionResult> {
  const { ctrl, backend } = deps
  if (!backend.probeStyle) return { attempted: 0, remaining: [] }
  const attempts = new Map<string, number>()

  const settle = async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 500)),
    ])
    await backend.whenIdle()
  }
  const lint = () =>
    lintContrastAfterSettle({
      scene: ctrl.store.state.document.scene,
      measure: (id) => backend.measure(id),
      probe: (id) => backend.probeStyle!(id),
      revision: ctrl.history.lastSeq,
    })

  for (let pass = 0; pass < FIX_SESSION_PASSES; pass++) {
    await settle()
    const findings = await lint()
    const actionable = findings.filter((f) => {
      const budget = isStyledInkFinding(f) ? 1 : 2
      return (attempts.get(f.ids[0]) ?? 0) < budget
    })
    if (!actionable.length) break
    const escalate = new Set(
      actionable
        .filter((f) => (attempts.get(f.ids[0]) ?? 0) >= 1)
        .map((f) => f.ids[0])
    )
    const calls = autofixContrast(
      ctrl.store.state.document.scene,
      (id) => backend.measure(id),
      actionable,
      cssColorToRgba,
      "safe",
      { escalate }
    )
    if (!calls.length) break
    const res = ctrl.dispatch(calls, { source: "user", label: "Fix contrast" })
    if (!res.ok) break
    for (const f of actionable) {
      attempts.set(f.ids[0], (attempts.get(f.ids[0]) ?? 0) + 1)
    }
  }

  await settle()
  return { attempted: attempts.size, remaining: await lint() }
}
