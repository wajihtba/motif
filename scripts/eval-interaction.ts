// Eval lane 4 — direct-manipulation smoke. Drives the REAL editor in a
// headless Chrome against a running dev server and asserts the manual-editing
// invariants that have no jsdom seam (they regressed silently before):
//
//   stacking   the engine stage mounts BELOW the React overlays — z-index is
//              auto everywhere, so DOM order decides whether the selection
//              box / snap guides / lint badges are visible at all
//   select     clicking an element selects it and renders the bounding box
//              (resize handle present)
//   cursor     default arrow over the artboard (not the text I-beam)
//   dblclick   double-click on a text leaf opens the inline editor, typing +
//              blur commits through element.setHtml, and interaction still
//              works afterwards — regressed when pointerdown was
//              preventDefault()ed (cancelling pointerdown suppresses the
//              compatibility mousedown/dblclick stream)
//   snap       dragging near a sibling edge shows guides and lands snapped
//   layout     layout.align / distribute / stackify produce the geometry
//              they promise, against live measured boxes
//
// Run:
//   bun run dev                              # terminal 1
//   bun scripts/eval-interaction.ts [baseUrl]  # terminal 2
//
// Requires a local Chrome (CHROME_PATH overrides /usr/bin/google-chrome).
// The HTML-in-Canvas flag is NOT required: painting is stubbed when absent —
// every assertion here reads DOM/state, not pixels.

import puppeteer from "puppeteer-core"

const BASE = process.argv[2] ?? "http://localhost:3000"
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome"

interface Check {
  name: string
  pass: boolean
  detail: unknown
}

declare global {
  interface Window {
    __motif?: {
      ctrl: {
        store: { state: MotifState }
        dispatch: (
          calls: unknown,
          opts?: { label?: string }
        ) => { ok: boolean; errors: string[] }
      }
      backend: {
        stage: HTMLElement
        measure: (id: string) => Box | null
        whenIdle: () => Promise<void>
      }
    }
  }
}
interface Box {
  x: number
  y: number
  w: number
  h: number
}
interface MotifState {
  selection: string[]
  document: {
    scene: { baseWidth: number; baseHeight: number; root: SceneNodeLite }
  }
}
interface SceneNodeLite {
  id: string
  html?: string
  children?: SceneNodeLite[]
}

const checks: Check[] = []
const check = (name: string, pass: boolean, detail: unknown) => {
  checks.push({ name, pass, detail })
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`
  )
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--enable-blink-features=CanvasDrawElement"],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1700, height: 1000 })
  // Painting stub for unflagged Chrome — DOM layout, measurement, and the
  // overlays (everything this eval asserts) don't need real canvas pixels.
  await page.evaluateOnNewDocument(() => {
    const proto = CanvasRenderingContext2D.prototype as unknown as Record<
      string,
      unknown
    >
    if (!("drawElementImage" in proto) && !("drawElement" in proto)) {
      proto.drawElementImage = function () {}
    }
  })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`)
  })

  await page.goto(`${BASE}/editor/eval-interaction-${Date.now()}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  })
  await page.waitForFunction(() => window.__motif?.backend, {
    timeout: 20_000,
  })

  // ---- seed: three absolute leaves ----------------------------------------
  await page.evaluate(() => {
    const { ctrl } = window.__motif!
    const s = ctrl.store.state.document.scene
    const abs = (x: number, y: number, w: number, h: number) => ({
      mode: "absolute",
      anchor: "top-left",
      dx: x / s.baseWidth,
      dy: y / s.baseHeight,
      width: w / s.baseWidth,
      height: h / s.baseHeight,
    })
    ctrl.dispatch([
      {
        command: "element.create",
        args: {
          node: {
            id: "elA",
            role: "headline",
            html: "<div>Hello Motif</div>",
            layout: abs(100, 100, 300, 80),
            css: { background: "#223", color: "#fff", fontSize: "32px" },
          },
        },
      },
      {
        command: "element.create",
        args: {
          node: {
            id: "elB",
            role: "badge",
            html: "<div></div>",
            layout: abs(600, 340, 200, 150),
            css: { background: "#3a6" },
          },
        },
      },
      {
        command: "element.create",
        args: {
          node: {
            id: "elC",
            role: "subhead",
            html: "<div>Second line</div>",
            layout: abs(100, 500, 240, 60),
            css: { background: "#633", color: "#fff", fontSize: "24px" },
          },
        },
      },
      { command: "element.select", args: { ids: null } },
    ])
  })
  await page.evaluate(() => window.__motif!.backend.whenIdle())

  const screenPoint = (nodeId: string) =>
    page.evaluate((id) => {
      const { backend, ctrl } = window.__motif!
      const b = backend.measure(id)
      if (!b) return null
      const r = backend.stage.getBoundingClientRect()
      const s = r.width / ctrl.store.state.document.scene.baseWidth
      return {
        x: r.left + (b.x + b.w / 2) * s,
        y: r.top + (b.y + b.h / 2) * s,
        box: b,
        scale: s,
      }
    }, nodeId)

  // ---- stacking -------------------------------------------------------------
  const stacking = await page.evaluate(() => {
    const stage = window.__motif!.backend.stage
    const fit = stage.closest(".canvas-well")!.firstElementChild!
    let top: Element = stage
    while (top.parentElement !== fit) top = top.parentElement!
    return {
      stageChildIndex: [...fit.children].indexOf(top),
      fitChildren: fit.children.length,
    }
  })
  check(
    "stacking: stage is the first fit-layer child (overlays paint above)",
    stacking.stageChildIndex === 0,
    stacking
  )

  // ---- select ---------------------------------------------------------------
  const pA = (await screenPoint("elA"))!
  await page.mouse.click(pA.x, pA.y)
  await new Promise((r) => setTimeout(r, 250))
  const sel = await page.evaluate(() => ({
    selection: window.__motif!.ctrl.store.state.selection,
    handle: !!document.querySelector("[data-resize-handle]"),
  }))
  check(
    "select: click selects and renders the bounding box",
    sel.selection[0] === "elA" && sel.handle,
    sel
  )

  // ---- cursor ---------------------------------------------------------------
  const cursor = await page.evaluate(
    (x, y) => {
      const el = document.elementFromPoint(x, y)
      return el ? getComputedStyle(el).cursor : null
    },
    pA.x,
    pA.y
  )
  check("cursor: default over artboard content", cursor === "default", {
    cursor,
  })

  // ---- hover affordance + escape deselect -------------------------------------
  const pC0 = (await screenPoint("elC"))!
  await page.mouse.move(pC0.x, pC0.y)
  await new Promise((r) => setTimeout(r, 150))
  const hover = await page.evaluate(
    () => !!document.querySelector('[data-motif="hover-outline"]')
  )
  check("hover: outline shows over an unselected element", hover, { hover })
  await page.keyboard.press("Escape")
  await new Promise((r) => setTimeout(r, 150))
  const afterEsc = await page.evaluate(
    () => window.__motif!.ctrl.store.state.selection
  )
  check("escape: clears the selection", afterEsc.length === 0, {
    selection: afterEsc,
  })
  await page.mouse.click(pA.x, pA.y) // reselect for the dblclick chain

  // ---- dblclick → inline edit → commit → still alive -------------------------
  await page.mouse.click(pA.x, pA.y, { count: 2 })
  await new Promise((r) => setTimeout(r, 250))
  const open = await page.evaluate(() => {
    const ed = document.querySelector<HTMLElement>(
      '[data-motif="inline-editor"]'
    )
    return { open: !!ed, focused: document.activeElement === ed }
  })
  check("dblclick: inline text editor opens focused", open.open && open.focused, open)

  await page.keyboard.type(" EDITED")
  const pEmpty = await page.evaluate(() => {
    const r = window.__motif!.backend.stage.getBoundingClientRect()
    return { x: r.left + r.width - 20, y: r.top + r.height - 20 }
  })
  await page.mouse.click(pEmpty.x, pEmpty.y)
  await new Promise((r) => setTimeout(r, 300))
  const committed = await page.evaluate(() => {
    const { ctrl } = window.__motif!
    const find = (n: SceneNodeLite): SceneNodeLite | undefined =>
      n.id === "elA" ? n : n.children?.map(find).find(Boolean)
    return {
      editorGone: !document.querySelector('[data-motif="inline-editor"]'),
      html: find(ctrl.store.state.document.scene.root)?.html,
    }
  })
  check(
    "dblclick: blur commits the edit and closes the editor",
    committed.editorGone && /EDITED/.test(committed.html ?? ""),
    committed
  )
  const pB = (await screenPoint("elB"))!
  await page.mouse.click(pB.x, pB.y)
  await new Promise((r) => setTimeout(r, 250))
  const alive = await page.evaluate(() => ({
    selection: window.__motif!.ctrl.store.state.selection,
    handle: !!document.querySelector("[data-resize-handle]"),
  }))
  check(
    "dblclick: selection still works after an edit",
    alive.selection[0] === "elB" && alive.handle,
    alive
  )

  // ---- snap -------------------------------------------------------------------
  const c0 = (await screenPoint("elC"))!
  const a0 = (await screenPoint("elA"))!
  const target = {
    x:
      a0.x -
      (a0.box.w / 2) * a0.scale +
      3 +
      (c0.box.w / 2) * c0.scale,
    y: c0.y - 60 * c0.scale,
  }
  await page.mouse.move(c0.x, c0.y)
  await page.mouse.down()
  let guidesSeen = 0
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      c0.x + ((target.x - c0.x) * i) / 12,
      c0.y + ((target.y - c0.y) * i) / 12
    )
    await new Promise((r) => setTimeout(r, 25))
    guidesSeen += await page.evaluate(
      () => document.querySelectorAll('[data-motif="snap-guide"]').length
    )
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 250))
  const snapped = await page.evaluate(() => {
    const { backend } = window.__motif!
    return { A: backend.measure("elA")!, C: backend.measure("elC")! }
  })
  const snapDelta = Math.abs(snapped.A.x - snapped.C.x)
  check("snap: guides visible during drag", guidesSeen > 0, { guidesSeen })
  check("snap: drop lands on the sibling edge", snapDelta < 0.75, {
    snapDelta,
  })

  // ---- layout commands ----------------------------------------------------------
  const layout = await page.evaluate(async () => {
    const { ctrl, backend } = window.__motif!
    ctrl.dispatch([
      { command: "layout.align", args: { ids: ["elA", "elC"], edge: "left" } },
    ])
    await backend.whenIdle()
    const align = { A: backend.measure("elA")!, C: backend.measure("elC")! }
    ctrl.dispatch([
      {
        command: "layout.distribute",
        args: { ids: ["elA", "elB", "elC"], direction: "vertical" },
      },
    ])
    await backend.whenIdle()
    const distribute = {
      A: backend.measure("elA")!,
      B: backend.measure("elB")!,
      C: backend.measure("elC")!,
    }
    ctrl.dispatch([
      {
        command: "layout.stackify",
        args: { ids: ["elA", "elC"], direction: "column", gap: 24 },
      },
    ])
    await backend.whenIdle()
    const stackify = {
      A: backend.measure("elA")!,
      C: backend.measure("elC")!,
      selection: ctrl.store.state.selection,
    }
    return { align, distribute, stackify }
  })
  check(
    "layout.align left: shared left edge",
    Math.abs(layout.align.A.x - layout.align.C.x) < 0.75,
    layout.align
  )
  const rows = [layout.distribute.A, layout.distribute.B, layout.distribute.C].sort(
    (a, b) => a.y - b.y
  )
  const g1 = rows[1].y - (rows[0].y + rows[0].h)
  const g2 = rows[2].y - (rows[1].y + rows[1].h)
  check("layout.distribute vertical: equal gaps", Math.abs(g1 - g2) < 1.5, {
    g1,
    g2,
  })
  const st = layout.stackify
  check(
    "layout.stackify column: stacked without overlap",
    st.C.y >= st.A.y + st.A.h - 0.5 &&
      st.selection.length === 1 &&
      st.selection[0].startsWith("stack"),
    st
  )

  check("no console/page errors", errors.length === 0, {
    errors: errors.slice(0, 10),
  })

  const failed = checks.filter((c) => !c.pass)
  console.log(
    `\n${checks.length - failed.length}/${checks.length} interaction checks pass`
  )
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
}
