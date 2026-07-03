// Eval lane 3 — live-model smoke (docs/plan/03-agent-first.md §7).
//
// Ten canonical briefs through the REAL agent loop in a real (flagged,
// headless) Chrome against a running dev server, asserting programmatic
// invariants per brief:
//
//   roles     required roles present (headline + cta)
//   bounds    every measured element box inside the canvas (+8px slack)
//   contrast  text luminance vs the pixels behind it ≥ 3:1 (soft — warns)
//   export    PNG export completes and is non-empty
//   rounds    agent finished within the loop iteration cap
//   errors    no console/page errors
//
// Run:  ANTHROPIC_API_KEY must be set in the dev server's env (.env) or the
// server falls back to the keyless mock stream (the script detects the mock
// and says so — results still validate the harness itself).
//
//   bun run dev            # terminal 1
//   bun scripts/eval-live.ts [baseUrl]   # terminal 2
//
// Requires a local Chrome with the HTML-in-Canvas flag (CHROME_PATH env
// overrides the default /usr/bin/google-chrome).

import puppeteer from "puppeteer-core"

const BASE = process.argv[2] ?? "http://localhost:3000"
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome"

const BRIEFS = [
  "Instagram post for a spring plant-shop sale, 20% off everything",
  "Launch announcement for a minimalist note-taking app called Slate",
  "Flash sale story for streetwear brand VOLT — tonight only",
  "Cozy autumn menu promo for a neighborhood café",
  "Webinar invite: 'Scaling design systems', Thursday 5pm CET",
  "New single release cover post for an indie synth band",
  "Black Friday teaser for a headphone brand, dark and premium",
  "Farmers-market weekend banner, bright and friendly",
  "SaaS feature update: 'Realtime comments are here'",
  "Yoga studio New Year challenge signup post",
] as const

interface BriefResult {
  brief: string
  roles: boolean
  bounds: boolean
  contrast: boolean
  exported: boolean
  rounds: boolean
  errors: string[]
  mock: boolean
}

async function evalBrief(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  brief: string,
  index: number
): Promise<BriefResult> {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  const errors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200))
  })
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))

  await page.goto(`${BASE}/editor/eval-${index}-${Date.now().toString(36)}`, {
    waitUntil: "domcontentloaded",
  })
  await page.waitForSelector("textarea", { timeout: 30000 })
  await page.waitForFunction(
    () => Boolean((window as { __motif?: unknown }).__motif),
    { timeout: 30000 }
  )
  await new Promise((r) => setTimeout(r, 500))
  await page.type("textarea", brief)
  await page.keyboard.press("Enter")

  // Turn complete = chat leaves "running".
  await page.waitForFunction(
    () => {
      const m = (
        window as unknown as {
          __motif?: { chat: { getSnapshot: () => { status: string } } }
        }
      ).__motif
      return m ? m.chat.getSnapshot().status !== "running" : false
    },
    { timeout: 180000, polling: 500 }
  )
  await new Promise((r) => setTimeout(r, 1500)) // engine settle

  const result = await page.evaluate(async () => {
    const m = (
      window as unknown as {
        __motif: {
          ctrl: {
            store: {
              state: {
                document: {
                  scene: {
                    baseWidth: number
                    baseHeight: number
                    root: unknown
                  }
                }
              }
            }
          }
          backend: {
            measure: (
              id: string
            ) => { x: number; y: number; w: number; h: number } | null
            canvas: HTMLCanvasElement
          }
          chat: { getSnapshot: () => { items: Array<{ kind: string }> } }
        }
      }
    ).__motif
    const scene = m.ctrl.store.state.document.scene

    interface Node {
      id: string
      role?: string
      html?: string
      css?: Record<string, string>
      hidden?: boolean
      children?: Node[]
    }
    const nodes: Node[] = []
    const walk = (n: Node) => {
      nodes.push(n)
      n.children?.forEach(walk)
    }
    walk(scene.root as Node)

    const roles = new Set(nodes.map((n) => n.role).filter(Boolean))
    const hasRoles = roles.has("headline") && roles.has("cta")

    // Bounds: text-bearing elements must stay inside the canvas. Decorative
    // layers (scrims, glows, vignettes, images) may bleed by design.
    const TEXT_ROLES = new Set([
      "eyebrow",
      "headline",
      "subhead",
      "cta",
      "badge",
      "price",
      "meta",
    ])
    const SLACK = 8
    let inBounds = true
    for (const n of nodes) {
      if (n.id === "root" || n.hidden) continue
      if (!n.role || !TEXT_ROLES.has(n.role)) continue
      const b = m.backend.measure(n.id)
      if (!b) continue
      if (
        b.x < -SLACK ||
        b.y < -SLACK ||
        b.x + b.w > scene.baseWidth + SLACK ||
        b.y + b.h > scene.baseHeight + SLACK
      ) {
        inBounds = false
      }
    }

    // Contrast (soft): headline text color vs mean canvas luminance under it.
    const lum = (r: number, g: number, b: number) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    let contrastOk = true
    const headline = nodes.find((n) => n.role === "headline")
    const hb = headline && m.backend.measure(headline.id)
    if (headline && hb) {
      const probe = document.createElement("canvas")
      probe.width = 4
      probe.height = 4
      const ctx = probe.getContext("2d")!
      const dpr = m.backend.canvas.width / scene.baseWidth
      ctx.drawImage(
        m.backend.canvas,
        hb.x * dpr,
        hb.y * dpr,
        hb.w * dpr,
        hb.h * dpr,
        0,
        0,
        4,
        4
      )
      const px = ctx.getImageData(0, 0, 4, 4).data
      let back = 0
      for (let i = 0; i < px.length; i += 4) {
        back += lum(px[i], px[i + 1], px[i + 2])
      }
      back /= px.length / 4
      // Text color from the measurement host's computed style.
      const host = document.querySelector(
        `[data-motif='measurement-host'] [data-id='${headline.id}']`
      )
      if (host) {
        const c = getComputedStyle(host).color.match(/\d+/g)
        if (c) {
          const fore = lum(Number(c[0]), Number(c[1]), Number(c[2]))
          const ratio =
            (Math.max(fore, back) + 0.05) / (Math.min(fore, back) + 0.05)
          contrastOk = ratio >= 3
        }
      }
    }

    // Export completes.
    let exported = false
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        m.backend.canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("null blob"))),
          "image/png"
        )
      })
      exported = blob.size > 1000
    } catch {
      exported = false
    }

    const toolChips = m.chat
      .getSnapshot()
      .items.filter((i) => i.kind === "tool").length

    return {
      hasRoles,
      inBounds,
      contrastOk,
      exported,
      rounds: toolChips > 0 && toolChips <= 12,
      mock: document.body.innerText.includes("coffee"), // mock always builds the coffee promo
    }
  })

  await page.close()
  return {
    brief,
    roles: result.hasRoles,
    bounds: result.inBounds,
    contrast: result.contrastOk,
    exported: result.exported,
    rounds: result.rounds,
    errors: errors.filter((e) => !e.includes("favicon")),
    mock: result.mock,
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell" as never,
    args: [
      "--headless=new",
      "--enable-experimental-web-platform-features",
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "--window-size=1600,1000",
    ],
  })

  const results: BriefResult[] = []
  for (let i = 0; i < BRIEFS.length; i++) {
    console.log(`\n[${i + 1}/${BRIEFS.length}] ${BRIEFS[i]}`)
    try {
      const r = await evalBrief(browser, BRIEFS[i], i)
      results.push(r)
      console.log(
        `  roles:${p(r.roles)} bounds:${p(r.bounds)} contrast:${p(r.contrast)}` +
          ` export:${p(r.exported)} rounds:${p(r.rounds)} errors:${r.errors.length}`
      )
      if (r.errors.length) console.log("  first error:", r.errors[0])
    } catch (e) {
      console.log("  CRASHED:", (e as Error).message)
      results.push({
        brief: BRIEFS[i],
        roles: false,
        bounds: false,
        contrast: false,
        exported: false,
        rounds: false,
        errors: [String(e)],
        mock: false,
      })
    }
  }
  await browser.close()

  const hard = (r: BriefResult) =>
    r.roles && r.bounds && r.exported && r.rounds && r.errors.length === 0
  const passed = results.filter(hard).length
  const softWarn = results.filter((r) => !r.contrast).length
  const mocked = results.every((r) => r.mock)

  console.log(`\npassed ${passed}/${results.length} hard gates`)
  if (softWarn) console.log(`contrast soft-warnings: ${softWarn}`)
  if (mocked) {
    console.log(
      "NOTE: every run produced the mock scene — the server has no " +
        "ANTHROPIC_API_KEY, so this validated the harness, not the model."
    )
  }
  process.exit(passed === results.length ? 0 : 1)
}

function p(ok: boolean): string {
  return ok ? "✓" : "✗"
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
