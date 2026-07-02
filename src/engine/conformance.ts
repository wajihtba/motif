// Startup platform-conformance self-test (docs/plan/01-architecture.md §2).
//
// The HTML-in-Canvas API is experimental: paint-record semantics have shifted
// between Chrome versions and could again. Rather than discovering drift as
// mysterious rendering bugs, this suite probes every behavior the engine
// depends on and reports pass/fail/info per case. Run it in the dev harness
// and at editor startup (console) — it is cheap (~10 frames, one tiny canvas).
//
// 'fail' = an assumption the engine REQUIRES is broken on this browser.
// 'info' = documented platform behavior we track but tolerate either way.

export interface ConformanceCase {
  id: string
  label: string
  status: "pass" | "fail" | "info"
  detail?: string
}

type Draw = (
  el: Element,
  x: number,
  y: number,
  w?: number,
  h?: number
) => unknown

export async function runConformance(): Promise<ConformanceCase[]> {
  const out: ConformanceCase[] = []
  const dpr = window.devicePixelRatio || 1

  // The probe canvas must be ON-SCREEN: off-viewport (and fully transparent)
  // canvases never receive paint records, so every draw silently no-ops —
  // discovered by this very suite. Parked behind the page instead.
  const container = document.createElement("div")
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-9999",
    pointerEvents: "none",
  })
  const canvas = document.createElement("canvas")
  canvas.setAttribute("layoutsubtree", "")
  canvas.width = Math.round(300 * dpr)
  canvas.height = Math.round(150 * dpr)
  canvas.style.width = "300px"
  canvas.style.height = "150px"
  const probe = document.createElement("div")
  Object.assign(probe.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "50px",
    height: "50px",
    background: "#ff0000",
  })
  canvas.appendChild(probe)
  container.appendChild(canvas)
  document.body.appendChild(container)

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const draw: Draw | null = ctx.drawElementImage
    ? ctx.drawElementImage.bind(ctx)
    : ctx.drawElement
      ? ctx.drawElement.bind(ctx)
      : null

  const px = (x: number, y: number): [number, number, number, number] => {
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }
  const isRed = (p: [number, number, number, number]) =>
    p[0] > 200 && p[1] < 80 && p[2] < 80 && p[3] > 200
  const clear = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  // Paint inside the canvas's paint callback when available — records are
  // freshest there; the engine paints the same way. Draw errors must be
  // caught HERE: the callback runs outside the caller's stack, so a throw
  // would surface as an unhandled error instead of a test result.
  const paintOnce = (fn: () => void): Promise<Error | null> =>
    new Promise((resolve) => {
      const run = () => {
        try {
          fn()
          resolve(null)
        } catch (e) {
          resolve(e instanceof Error ? e : new Error(String(e)))
        }
      }
      if (canvas.requestPaint && "onpaint" in canvas) {
        canvas.onpaint = () => {
          canvas.onpaint = null
          run()
        }
        canvas.requestPaint()
      } else {
        requestAnimationFrame(run)
      }
    })

  try {
    // 1 — API presence: everything else depends on it.
    out.push({
      id: "api-present",
      label: "drawElementImage / drawElement exists",
      status: draw ? "pass" : "fail",
      detail: ctx.drawElementImage
        ? "drawElementImage"
        : ctx.drawElement
          ? "drawElement (older name)"
          : "neither — enable chrome://flags/#canvas-draw-element",
    })
    if (!draw) return out

    // 2 — layoutsubtree: canvas children get real layout.
    await raf(2)
    out.push({
      id: "layoutsubtree",
      label: "canvas children lay out (layoutsubtree)",
      status: probe.offsetWidth === 50 ? "pass" : "fail",
      detail: `probe offsetWidth=${probe.offsetWidth} (want 50)`,
    })

    // 3 — paint record exists after one lifecycle.
    await paintOnce(() => {
      clear()
      draw(probe, 0, 0)
    })
    const p3 = px(25 * dpr, 25 * dpr)
    out.push({
      id: "paint-after-raf",
      label: "element paints after one rAF",
      status: isRed(p3) ? "pass" : "fail",
      detail: `pixel(25,25)=rgba(${p3.join(",")})`,
    })

    // 4 — dpr mapping: 50 CSS px paints as 50×dpr device px.
    const inside = px(45 * dpr, 25 * dpr)
    const outside = px(60 * dpr, 25 * dpr)
    out.push({
      id: "dpr-mapping",
      label: `CSS→device px self-mapping (dpr=${dpr})`,
      status:
        isRed(inside) && !isRed(outside) ? "pass" : dpr === 1 ? "info" : "fail",
      detail: `inside=rgba(${inside.join(",")}) outside=rgba(${outside.join(",")})`,
    })

    // 5 — offset semantics: draw at (100,20); where do pixels land?
    await paintOnce(() => {
      clear()
      draw(probe, 100, 20)
    })
    const cssOffset = isRed(px((100 + 25) * dpr, (20 + 25) * dpr))
    const devOffset = dpr !== 1 && isRed(px(100 + 25, 20 + 25))
    out.push({
      id: "offset-draw",
      label: "draw x/y offsets are CSS px",
      status: cssOffset ? "pass" : devOffset ? "info" : "fail",
      detail: cssOffset
        ? "offsets scale by dpr (CSS px) — engine assumption holds"
        : devOffset
          ? "offsets are DEVICE px — adjust compositor static path"
          : "content not found at either mapping",
    })

    // 6 — clear + redraw from the same record.
    await paintOnce(() => {
      clear()
      draw(probe, 0, 0)
    })
    out.push({
      id: "clear-redraw",
      label: "records survive clearRect (multi-pass frames)",
      status: isRed(px(25 * dpr, 25 * dpr)) ? "pass" : "fail",
    })

    // 7 — same-frame mutation is NOT visible (records refresh between
    // lifecycles). This is the constraint loop.ts encodes.
    probe.style.background = "#0000ff"
    await paintOnce(() => {
      clear()
      draw(probe, 0, 0)
    })
    const afterMutate = px(25 * dpr, 25 * dpr)
    const stillRed = isRed(afterMutate)
    out.push({
      id: "record-lifecycle",
      label: "DOM mutation needs a settle frame",
      status: "info",
      detail: stillRed
        ? "same-frame mutation invisible (cached records — expected)"
        : "records refreshed same-frame (better than assumed)",
    })
    await raf(2) // let blue bake, then verify it arrives at all
    await paintOnce(() => {
      clear()
      draw(probe, 0, 0)
    })
    const p7 = px(25 * dpr, 25 * dpr)
    out.push({
      id: "record-refresh",
      label: "mutation visible after settle frame",
      status: p7[2] > 200 && p7[0] < 80 ? "pass" : "fail",
      detail: `pixel=rgba(${p7.join(",")})`,
    })
    probe.style.background = "#ff0000"
    await raf(2)

    // 8 — immediate-children-only: drawing a deep descendant directly.
    const parent = document.createElement("div")
    Object.assign(parent.style, {
      position: "absolute",
      left: "0px",
      top: "60px",
      width: "50px",
      height: "50px",
    })
    const nested = document.createElement("div")
    Object.assign(nested.style, {
      width: "50px",
      height: "50px",
      background: "#00ff00",
    })
    parent.appendChild(nested)
    canvas.appendChild(parent)
    await raf(2)
    let nestedResult: string
    const nestedErr = await paintOnce(() => {
      clear()
      draw(nested, 0, 0)
    })
    if (nestedErr) {
      nestedResult = `throws (${nestedErr.name})`
    } else {
      const p8 = px(25 * dpr, 25 * dpr)
      nestedResult = p8[1] > 200 ? "painted" : "no-op"
    }
    out.push({
      id: "immediate-children",
      label: "deep descendants cannot be drawn directly",
      status: "info",
      detail: `drawing a nested div: ${nestedResult}`,
    })
    parent.remove()

    // 9 — foreign canvas: can another canvas draw our element? (If this ever
    // starts working, unit capture can skip the visible-canvas roundtrip.)
    const scratch = document.createElement("canvas")
    scratch.width = 100
    scratch.height = 100
    const sctx = scratch.getContext("2d")!
    const sdraw: Draw | null = sctx.drawElementImage
      ? sctx.drawElementImage.bind(sctx)
      : sctx.drawElement
        ? sctx.drawElement.bind(sctx)
        : null
    let foreign = "unavailable"
    if (sdraw) {
      try {
        sdraw(probe, 0, 0)
        const d = sctx.getImageData(25, 25, 1, 1).data
        foreign = d[3] > 0 ? "works" : "no-op"
      } catch (e) {
        foreign = `throws (${(e as Error).name})`
      }
    }
    out.push({
      id: "foreign-canvas",
      label: "draw into a non-owner canvas",
      status: "info",
      detail: foreign,
    })

    // 10 — paint hooks the loop prefers.
    out.push({
      id: "paint-hooks",
      label: "requestPaint / onpaint hooks",
      status: canvas.requestPaint && "onpaint" in canvas ? "pass" : "info",
      detail: canvas.requestPaint ? "present" : "absent — rAF fallback in use",
    })
  } finally {
    container.remove()
  }
  return out
}

function raf(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}
