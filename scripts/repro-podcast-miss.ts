// @ts-nocheck — the /src/... dynamic imports are Vite dev-server URLs resolved
// in the BROWSER (page.evaluate), invalid to tsc on the node side.
// Acceptance: the REAL ex-podcast-vapor gallery scene (vaporwave look baked —
// duotone scene shader + a filter on EVERY text node) with a brand-like
// --muted override (teal-gray on the purple gradient). This is the exact case
// the user reported as undetected: the old lint skipped any text carrying an
// element effect, so look-styled scenes were never checked at all. The
// ink-diff sampler must flag the subhead, and Auto-fix must resolve it.
//
//   npm run dev; npx tsx scripts/repro-podcast-miss.ts

import puppeteer from "puppeteer-core"

const BASE = process.argv[2] ?? "http://localhost:3000"
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome"

let failures = 0
const check = (name: string, pass: boolean, detail: unknown) => {
  if (!pass) failures++
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`)
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
  page.on("pageerror", (e) =>
    console.log("pageerror:", String(e).slice(0, 300))
  )

  await page.goto(`${BASE}/editor/repro-podcast-${Date.now()}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  })
  await page.waitForFunction(
    () => !!(window as unknown as { __motif?: unknown }).__motif,
    { timeout: 20_000 }
  )

  // Load the real gallery document (look effects baked into scene.effects),
  // then swap --muted the way a brand application would.
  const setup = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const m = (window as any).__motif
    const gal = await import("/src/content/gallery.ts")
    const ex = gal.GALLERY.find((g: any) => g.id === "ex-podcast-vapor")
    if (!ex) return { error: "example not found" }
    const doc = gal.buildGalleryDocument(ex)
    const scene = doc.scene
    // Headless GL (swiftshader) renders the look's WebGL shaders on an empty
    // texture — drop them for this test, keep the CPU `filter` effects. The
    // per-text vaporwave filter (hue-rotate 280°) is exactly what recolored
    // the user's text into unreadable green AND what the old lint used as a
    // reason to skip the node.
    scene.effects = scene.effects.filter((e: any) => e.kind === "filter")
    scene.theme.tokens["--muted"] = "#6f8b80" // brand-ish teal-gray
    const res = m.ctrl.dispatch([{ command: "scene.apply", args: scene }])
    await m.backend.whenIdle()
    return {
      ok: res.ok,
      effects: m.ctrl.store.state.document.scene.effects.map(
        (e: any) => `${e.kind}:${e.effect}→${e.target.type}`
      ),
    }
  })
  console.log("setup:", JSON.stringify(setup))

  // The subhead must be flagged despite the look's per-text filter.
  const flagged = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-motif="lint-badge"]')).some(
          (b) => {
            const t = (b as HTMLElement).title
            return t.includes("subhead") && t.includes("needs")
          }
        ),
      { timeout: 30_000 }
    )
    .then(() => true)
    .catch(() => false)
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-motif="lint-badge"]')).map(
      (b) => (b as HTMLElement).title
    )
  )
  check("detect: look-styled subhead flagged (was the miss)", flagged, titles)

  // The one-shot "Fix contrast" button must resolve every finding (halo for
  // styled ink) — explicitly invoked, bounded, never reactive.
  await page.evaluate(() => {
    document
      .querySelector<HTMLButtonElement>('[data-motif="contrast-fix"]')
      ?.click()
  })
  const cleared = await page
    .waitForFunction(
      () =>
        !Array.from(
          document.querySelectorAll('[data-motif="lint-badge"]')
        ).some((b) => (b as HTMLElement).title.includes("needs")),
      { timeout: 40_000 }
    )
    .then(() => true)
    .catch(() => false)
  const after = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const root = (window as any).__motif.ctrl.store.state.document.scene.root
    const stack = [root]
    const out: Record<string, unknown> = {}
    while (stack.length) {
      const n = stack.pop()
      if (n.role === "subhead") {
        out.textShadow = n.css.textShadow
        out.color = n.css.color
      }
      stack.push(...(n.children ?? []))
    }
    return out
  })
  check("fix: one-shot fix cleared the contrast findings", cleared, after)

  // NO-LOOP regression: once the session ends, nothing may keep dispatching.
  // The history sequence must sit still and no badge may flap back in.
  const seqBefore = await page.evaluate(
    () =>
      /* eslint-disable @typescript-eslint/no-explicit-any */
      (window as any).__motif.ctrl.history.lastSeq as number
  )
  await new Promise((r) => setTimeout(r, 5000))
  const seqAfter = await page.evaluate(
    () =>
      /* eslint-disable @typescript-eslint/no-explicit-any */
      (window as any).__motif.ctrl.history.lastSeq as number
  )
  const badgesNow = await page.evaluate(
    () => document.querySelectorAll('[data-motif="lint-badge"]').length
  )
  check(
    "no-loop: history is quiet after the fix session (no fix→detect→fix churn)",
    seqAfter === seqBefore,
    { seqBefore, seqAfter, badges: badgesNow }
  )

  // Timing: how long does one full contrast pass take on this scene?
  const timing = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const m = (window as any).__motif
    const lintMod = await import("/src/controller/contrast-lint.ts")
    const colorMod = await import("/src/lib/css-color.ts")
    const sampleMod = await import("/src/engine/export/sample-contrast.ts")
    const scene = m.ctrl.store.state.document.scene
    const t0 = performance.now()
    const { deferred } = lintMod.lintContrast(
      scene,
      (id: string) => m.backend.measure(id),
      (id: string) => m.backend.probeStyle(id),
      colorMod.cssColorToRgba
    )
    const t1 = performance.now()
    await sampleMod.sampleContrast(scene, deferred)
    const t2 = performance.now()
    return {
      tier1Ms: Math.round((t1 - t0) * 10) / 10,
      tier2Ms: Math.round(t2 - t1),
      deferred: deferred.length,
    }
  })
  console.log("timing:", JSON.stringify(timing))
  check(
    "perf: tier-2 pass under 3s for a full look-styled scene",
    timing.tier2Ms < 3000,
    timing
  )
} finally {
  await browser.close()
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks ok")
process.exit(failures ? 1 : 0)
