// Contrast-guard verification — drives the REAL editor in a headless flagged
// Chrome against a running dev server and asserts the end-to-end behavior of
// the contrast lint + auto-fix pipeline:
//
//   probe      backend.probeStyle resolves computed styles off the host
//   tier1      dark text on the dark default theme background → a
//              low-contrast badge appears on the canvas overlay
//   fix1       enabling Auto-fix recolors the text deterministically and the
//              badge clears
//   tier2      dark text over a dark gradient background → the pixel sampler
//              flags it (requires the HTML-in-Canvas flag; SKIPs without
//              real paint)
//   fix2       Auto-fix resolves the tier-2 finding too
//
// Run:
//   npm run dev                                # terminal 1
//   npx tsx scripts/verify-contrast.ts [base]  # terminal 2
//
// CHROME_PATH overrides /usr/bin/google-chrome.
//
// NOTE: every page.evaluate/waitForFunction body is a self-contained inline
// literal — outer-scope helpers don't survive esbuild's __name wrapping when
// serialized into the page.

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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`)
  })

  await page.goto(`${BASE}/editor/verify-contrast-${Date.now()}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  })
  await page.waitForFunction(
    () => !!(window as unknown as { __motif?: unknown }).__motif,
    { timeout: 20_000 }
  )

  const liveCanvas = await page.evaluate(() => {
    const c = document
      .createElement("canvas")
      .getContext("2d") as unknown as Record<string, unknown> | null
    return !!c && (!!c.drawElementImage || !!c.drawElement)
  })
  console.log(
    `html-in-canvas: ${liveCanvas ? "available" : "ABSENT (tier-2 will skip)"}`
  )

  // ---- probe + tier-1 seed: dark text on the dark default background ---------
  const probed = await page.evaluate(async () => {
    const m = (window as any).__motif
    const s = m.ctrl.store.state.document.scene
    m.ctrl.dispatch([
      {
        command: "element.create",
        args: {
          node: {
            id: "t1",
            role: "headline",
            html: "Barely there ghost text",
            layout: {
              mode: "absolute",
              anchor: "top-left",
              dx: 100 / s.baseWidth,
              dy: 100 / s.baseHeight,
              width: 600 / s.baseWidth,
              height: 90 / s.baseHeight,
            },
            css: { color: "#26262e", fontSize: "40px", fontWeight: "700" },
          },
          select: false,
        },
      },
    ])
    await m.backend.whenIdle()
    return m.backend.probeStyle ? m.backend.probeStyle("t1") : null
  })
  check(
    "probe: backend.probeStyle resolves computed style",
    !!probed && typeof probed === "object",
    probed && { color: (probed as { color: string }).color }
  )

  // ---- tier 1: badge appears ---------------------------------------------------
  const badge1 = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-motif="lint-badge"]')).some(
          (b) => (b as HTMLElement).title.includes("needs")
        ),
      { timeout: 15_000 }
    )
    .then(() => true)
    .catch(() => false)
  const titles1 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-motif="lint-badge"]')).map(
      (b) => (b as HTMLElement).title
    )
  )
  check("tier1: low-contrast badge on solid background", badge1, titles1)

  // ---- fix 1: the one-shot "Fix contrast" button recolors, badge clears --------
  await page.evaluate(() => {
    document
      .querySelector<HTMLButtonElement>('[data-motif="contrast-fix"]')
      ?.click()
  })
  const cleared1 = await page
    .waitForFunction(
      () => document.querySelectorAll('[data-motif="lint-badge"]').length === 0,
      { timeout: 15_000 }
    )
    .then(() => true)
    .catch(() => false)
  const colorAfter = await page.evaluate(() => {
    const root = (window as any).__motif.ctrl.store.state.document.scene.root
    const stack = [root]
    while (stack.length) {
      const n = stack.pop()
      if (n.id === "t1") return n.css.color as string
      stack.push(...(n.children ?? []))
    }
    return null
  })
  check(
    "fix1: auto-fix recolored the text and cleared the badge",
    cleared1 && !!colorAfter && colorAfter !== "#26262e",
    { cleared: cleared1, color: colorAfter }
  )

  // ---- tier 2: gradient backdrop → pixel-sampled finding -----------------------
  if (!liveCanvas) {
    check(
      "tier2: pixel-sampled finding over gradient",
      "skip",
      "no HTML-in-Canvas"
    )
    check(
      "fix2: auto-fix resolves the tier-2 finding",
      "skip",
      "no HTML-in-Canvas"
    )
  } else {
    await page.evaluate(async () => {
      const m = (window as any).__motif
      const s = m.ctrl.store.state.document.scene
      m.ctrl.dispatch([
        {
          command: "scene.setBackground",
          args: { value: "linear-gradient(180deg, #101018, #22222c)" },
        },
        {
          command: "element.create",
          args: {
            node: {
              id: "t2",
              role: "subhead",
              html: "Dark on a dark gradient",
              layout: {
                mode: "absolute",
                anchor: "top-left",
                dx: 100 / s.baseWidth,
                dy: 400 / s.baseHeight,
                width: 700 / s.baseWidth,
                height: 70 / s.baseHeight,
              },
              css: { color: "#33333d", fontSize: "34px" },
            },
            select: false,
          },
        },
      ])
      await m.backend.whenIdle()
    })
    const badge2 = await page
      .waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('[data-motif="lint-badge"]')
          ).some((b) => (b as HTMLElement).title.includes("#t2")),
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false)
    const titles2 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-motif="lint-badge"]')).map(
        (b) => (b as HTMLElement).title
      )
    )
    check("tier2: pixel-sampled finding over gradient", badge2, titles2)

    await page.evaluate(() => {
      document
        .querySelector<HTMLButtonElement>('[data-motif="contrast-fix"]')
        ?.click()
    })
    const cleared2 = await page
      .waitForFunction(
        () =>
          document.querySelectorAll('[data-motif="lint-badge"]').length === 0,
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false)
    const color2 = await page.evaluate(() => {
      const root = (window as any).__motif.ctrl.store.state.document.scene.root
      const stack = [root]
      while (stack.length) {
        const n = stack.pop()
        if (n.id === "t2") return n.css.color as string
        stack.push(...(n.children ?? []))
      }
      return null
    })
    check(
      "fix2: auto-fix resolves the tier-2 finding",
      cleared2 && color2 !== "#33333d",
      { cleared: cleared2, color: color2 }
    )
  }

  const relevantErrors = errors.filter(
    (e) => !/favicon|manifest|DevTools/i.test(e)
  )
  check(
    "errors: no page/console errors",
    relevantErrors.length === 0,
    relevantErrors
  )
} finally {
  await browser.close()
}

const failed = checks.filter((c) => c.pass === false)
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks ok${failed.length ? " — FAILURES ABOVE" : ""}`
)
process.exit(failed.length ? 1 : 0)
