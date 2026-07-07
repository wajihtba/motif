// Design-guard verification — drives the REAL editor in a headless flagged
// Chrome against a running dev server and asserts the end-to-end behavior
// of the guard registry + agent pass:
//
//   rules      seeded slop (overlap + uneven column + edge-hug + fixed-
//              height clip) → runSyncRules flags each rule at least once
//   probe      backend.probeScroll reads scroll extents off the host
//   pass       runGuardPass with agentAutofix dispatches "Design auto-fix"
//              and the re-lint comes back clean (or strictly reduced)
//   config     disabling a rule removes its findings from the next pass
//   menu       the TopBar Guard popover is mounted
//
// Run:
//   npm run dev                            # terminal 1
//   npx tsx scripts/verify-guard.ts [base] # terminal 2
//
// NOTE: every page.evaluate body is a self-contained inline literal —
// outer-scope helpers don't survive esbuild's __name wrapping.

import puppeteer from "puppeteer-core"

const BASE = process.argv[2] ?? "http://localhost:3000"
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome"

interface Check {
  name: string
  pass: boolean | "skip"
  detail: unknown
}
const checks: Check[] = []
const check = (name: string, pass: boolean | "skip", detail: unknown) => {
  checks.push({ name, pass, detail })
  const tag = pass === "skip" ? "SKIP" : pass ? "PASS" : "FAIL"
  console.log(`${tag}  ${name}  ${JSON.stringify(detail)}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-blink-features=CanvasDrawElement",
    "--enable-experimental-web-platform-features",
    "--enable-unsafe-swiftshader",
  ],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1700, height: 1000 })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`))

  await page.goto(`${BASE}/editor/verify-guard-${Date.now()}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  })
  await page.waitForFunction("!!window.__motif", { timeout: 20_000 })

  // ---- seed: one scene with a violation for every guard-native rule --------
  // (string-evaluated: inner named helpers would get esbuild's __name
  // wrapper, which doesn't exist inside the page)
  await page.evaluate(`(async () => {
    const m = window.__motif
    const s = m.ctrl.store.state.document.scene
    const W = s.baseWidth
    const H = s.baseHeight
    const abs = (x, y, w, h) => ({
      mode: "absolute",
      anchor: "top-left",
      dx: x / W,
      dy: y / H,
      width: w / W,
      height: h / H,
    })
    const el = (id, html, layout) => ({
      command: "element.create",
      args: { node: { id, role: "meta", html, layout } },
    })
    m.ctrl.dispatch([
      // x-offset from the column's lane: a negative gap (overlap) anywhere
      // in a lane rightly suppresses rhythm judgement for that lane, so the
      // overlap pair must not share x-range with col-a..d.
      el("ov-a", "Overlap headline", abs(620, 200, 400, 90)),
      el("ov-b", "Colliding subhead", abs(640, 250, 380, 60)),
      el("col-a", "Line one", abs(200, 480, 400, 40)),
      el("col-b", "Line two", abs(200, 544, 400, 40)),
      el("col-c", "Line three", abs(200, 632, 400, 40)),
      el("col-d", "Line four", abs(200, 696, 400, 40)),
      el("edge", "Hugging the edge", abs(20, 900, 300, 40)),
      el(
        "clip",
        "This is a long paragraph of text that cannot possibly fit inside a thirty-six pixel tall box at this width and will clip.",
        abs(650, 480, 260, 36)
      ),
    ])
    await m.backend.whenIdle()
    await new Promise((r) => setTimeout(r, 400))
    await m.backend.whenIdle()
  })()`)

  // ---- rules: every guard-native rule fires on the seeded slop -------------
  const found = (await page.evaluate(`(async () => {
    const m = window.__motif
    const reg = await import("/src/controller/guard/registry.ts")
    const settings = await import("/src/persistence/settings.ts")
    const ctx = reg.buildRuleContext(
      m.ctrl.store.state.document.scene,
      (id) => m.backend.measure(id),
      { probeScroll: (id) => m.backend.probeScroll(id) }
    )
    const findings = reg.runSyncRules(ctx, settings.getGuardConfig())
    return findings.map((f) => ({ rule: f.rule, ids: f.ids, msg: f.message }))
  })()`)) as Array<{ rule: string; ids: string[]; msg: string }>
  const rulesHit = new Set(found.map((f) => f.rule))
  check("rules: overlap", rulesHit.has("overlap"), found.filter((f) => f.rule === "overlap").length)
  check("rules: spacing-rhythm", rulesHit.has("spacing-rhythm"), found.find((f) => f.rule === "spacing-rhythm")?.msg)
  check("rules: edge-margin", rulesHit.has("edge-margin"), found.find((f) => f.rule === "edge-margin")?.msg)
  check("rules: text-clip", rulesHit.has("text-clip"), found.find((f) => f.rule === "text-clip")?.msg)

  // ---- probe ---------------------------------------------------------------
  const scroll = (await page.evaluate(
    `window.__motif.backend.probeScroll("clip")`
  )) as { scrollH: number; clientH: number } | null
  check(
    "probe: scrollH > clientH on the clipped box",
    !!scroll && scroll.scrollH > scroll.clientH + 4,
    scroll
  )

  // ---- pass: deterministic fixes converge -----------------------------------
  const pass = (await page.evaluate(`(async () => {
    const m = window.__motif
    const run = await import("/src/controller/guard/run.ts")
    const settings = await import("/src/persistence/settings.ts")
    const before = m.ctrl.history.lastSeq
    const result = await run.runGuardPass({
      ctrl: m.ctrl,
      backend: m.backend,
      config: { ...settings.getGuardConfig(), agentAutofix: true },
      fixAttempted: new Set(),
      contrastFixAttempted: new Set(),
    })
    await m.backend.whenIdle()
    const labels = []
    for (const e of m.ctrl.history.since ? m.ctrl.history.since(before) : []) {
      labels.push(e.label)
    }
    return {
      remaining: result.findings.map((f) => ({ rule: f.rule, ids: f.ids })),
      lines: result.lines,
      fixLabels: labels.filter((l) => l && l.includes("auto-fix")),
    }
  })()`)) as {
    remaining: Array<{ rule: string; ids: string[] }>
    lines: string[]
    fixLabels: string[]
  }
  check(
    "pass: Design auto-fix dispatched",
    pass.fixLabels.length > 0,
    pass.fixLabels
  )
  const layoutRemaining = pass.remaining.filter((f) => f.rule !== "low-contrast")
  check(
    "pass: sync findings resolved (or strictly reduced)",
    layoutRemaining.length < found.length,
    { before: found.length, after: layoutRemaining.length, remaining: layoutRemaining }
  )

  // ---- config: disabling a rule silences it ---------------------------------
  const toggled = (await page.evaluate(`(async () => {
    const m = window.__motif
    const reg = await import("/src/controller/guard/registry.ts")
    const settings = await import("/src/persistence/settings.ts")
    settings.setGuardConfig({ rules: { "edge-margin": { enabled: false } } })
    const ctx = reg.buildRuleContext(
      m.ctrl.store.state.document.scene,
      (id) => m.backend.measure(id),
      { probeScroll: (id) => m.backend.probeScroll(id) }
    )
    const off = reg.runSyncRules(ctx, settings.getGuardConfig())
    settings.setGuardConfig({ rules: { "edge-margin": { enabled: true } } })
    return off.map((f) => f.rule)
  })()`)) as string[]
  check(
    "config: disabled rule emits nothing",
    !toggled.includes("edge-margin"),
    toggled
  )

  // ---- menu ------------------------------------------------------------------
  const menu = (await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button")]
    return buttons.some((b) => (b.textContent ?? "").includes("Guard"))
  })()`)) as boolean
  check("menu: Guard popover trigger mounted", menu, undefined)

  if (errors.length) console.log("page errors:", errors.slice(0, 5))
} finally {
  await browser.close()
}

const failed = checks.filter((c) => c.pass === false)
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed`
)
process.exit(failed.length ? 1 : 0)
