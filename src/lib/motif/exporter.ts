// ── M.exporter — Export Module ──
// HTML, PNG, PDF, WebM

import { bus } from "./bus"
import { kernel } from "./kernel"
import { store } from "./store"

class Exporter {
  async exportHTML(): Promise<string> {
    bus.emit("export:started", { format: "html" })

    const parts: string[] = []
    parts.push("<!DOCTYPE html>")
    parts.push(`<html lang="en"><head><meta charset="utf-8">`)
    parts.push(`<meta name="viewport" content="width=device-width,initial-scale=1">`)
    parts.push(`<title>Motif Export</title>`)
    parts.push(`<style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #f5f5f5; display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 40px; }
      .slide { width: ${store.bW}px; height: ${store.bH}px; background: #fff; position: relative; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    </style></head><body>`)

    for (const slide of store.slides) {
      const html = kernel.serializeSlide(slide.id)
      parts.push(`<div class="slide">`)
      parts.push(html)
      parts.push(`</div>`)
    }

    parts.push("</body></html>")
    bus.emit("export:ended", { format: "html" })

    const blob = new Blob([parts.join("\n")], { type: "text/html" })
    this._download(blob, "motif-export.html")
    return parts.join("\n")
  }

  async exportPNG(scale: number = 2): Promise<void> {
    bus.emit("export:started", { format: "png" })

    const slide = store.active()
    if (!slide) return

    const canvas = await this._slideToCanvas(slide.id, scale)
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (blob) this._download(blob, "motif-export.png")
      bus.emit("export:ended", { format: "png" })
    }, "image/png")
  }

  async exportPDF(scale: number = 2): Promise<void> {
    bus.emit("export:started", { format: "pdf" })

    const { jsPDF } = await import("jspdf")

    const isLandscape = store.bW > store.bH
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "px",
      format: [store.bW, store.bH],
    })

    for (let i = 0; i < store.slides.length; i++) {
      if (i > 0) pdf.addPage([store.bW, store.bH])

      const canvas = await this._slideToCanvas(store.slides[i].id, scale)
      if (canvas) {
        const imgData = canvas.toDataURL("image/png")
        pdf.addImage(imgData, "PNG", 0, 0, store.bW, store.bH)
      }
    }

    pdf.save("motif-export.pdf")
    bus.emit("export:ended", { format: "pdf" })
  }

  async exportWebM(): Promise<void> {
    bus.emit("export:started", { format: "webm" })

    const canvas = document.createElement("canvas")
    canvas.width = store.bW * 2
    canvas.height = store.bH * 2
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 5000000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" })
      this._download(blob, "motif-export.webm")
      bus.emit("export:ended", { format: "webm" })
    }

    recorder.start()

    for (const slide of store.slides) {
      const frame = await this._slideToCanvas(slide.id, 2)
      if (frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(frame, 0, 0)
      }
      await new Promise((r) => setTimeout(r, 3000))
    }

    recorder.stop()
  }

  private async _slideToCanvas(
    slideId: string,
    scale: number
  ): Promise<HTMLCanvasElement | null> {
    const slide = store.getSlide(slideId)
    if (!slide) return null

    const clone = document.createElement("div")
    clone.style.cssText = `
      position: fixed;
      left: -99999px;
      top: 0;
      width: ${store.bW}px;
      height: ${store.bH}px;
      background: #fff;
      overflow: hidden;
      z-index: -1;
    `

    for (const child of Array.from(slide.shadow.children)) {
      if (child === slide.styleEl || child === slide.gridEl) continue
      clone.appendChild(child.cloneNode(true))
    }

    document.body.appendChild(clone)

    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(clone, {
        width: store.bW,
        height: store.bH,
        scale,
        useCORS: true,
        logging: false,
      })
      return canvas
    } catch {
      const canvas = document.createElement("canvas")
      canvas.width = store.bW * scale
      canvas.height = store.bH * scale
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#fff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.font = "24px sans-serif"
        ctx.fillStyle = "#333"
        ctx.fillText("Export preview unavailable", 40, 60)
      }
      return canvas
    } finally {
      clone.remove()
    }
  }

  private _download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

export const exporter = new Exporter()
