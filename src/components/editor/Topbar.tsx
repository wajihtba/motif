import { bus, exporter, store, viewport } from "~/lib/motif"
import { useMotifState } from "~/hooks/useMotif"
import { useState } from "react"

const PRESETS = [
  { label: "Story (1080×1920)", w: 1080, h: 1920 },
  { label: "Slide (1920×1080)", w: 1920, h: 1080 },
  { label: "Square (1080×1080)", w: 1080, h: 1080 },
  { label: "A4 (794×1123)", w: 794, h: 1123 },
  { label: "Twitter (1200×675)", w: 1200, h: 675 },
]

export function Topbar() {
  const { zoom } = useMotifState()
  const [showSize, setShowSize] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [gridOn, setGridOn] = useState(false)
  const [snapOn, setSnapOn] = useState(true)

  return (
    <div className="m-topbar">
      <div className="m-topbar-left">
        <span className="m-logo">Motif</span>

        <div className="m-topbar-group">
          <button
            className="m-btn-icon"
            title="Undo (Ctrl+Z)"
            onClick={() => bus.emit("history:undo")}
          >
            ↩
          </button>
          <button
            className="m-btn-icon"
            title="Redo (Ctrl+Shift+Z)"
            onClick={() => bus.emit("history:redo")}
          >
            ↪
          </button>
        </div>

        <div className="m-topbar-group" style={{ position: "relative" }}>
          <button
            className="m-btn-sm"
            onClick={() => setShowSize(!showSize)}
          >
            {store.bW}×{store.bH}
          </button>
          {showSize && (
            <div className="m-dropdown" style={{ top: "100%", left: 0 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="m-dropdown-item"
                  onClick={() => {
                    store.setBoardSize(p.w, p.h)
                    viewport.fit()
                    setShowSize(false)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="m-topbar-group">
          <button
            className={`m-btn-sm ${snapOn ? "active" : ""}`}
            onClick={() => setSnapOn(!snapOn)}
          >
            Snap
          </button>
          <button
            className={`m-btn-sm ${gridOn ? "active" : ""}`}
            onClick={() => {
              setGridOn(!gridOn)
              store.toggleGrid(!gridOn)
            }}
          >
            Grid
          </button>
        </div>
      </div>

      <div className="m-topbar-center">
        <span className="m-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="m-btn-icon" onClick={() => viewport.zoomOut()} title="Zoom out">
          −
        </button>
        <button className="m-btn-icon" onClick={() => viewport.zoomIn()} title="Zoom in">
          +
        </button>
        <button className="m-btn-icon" onClick={() => viewport.fit()} title="Fit to view">
          ⊙
        </button>
      </div>

      <div className="m-topbar-right" style={{ position: "relative" }}>
        <button
          className="m-btn-primary"
          onClick={() => setShowExport(!showExport)}
        >
          Export
        </button>
        {showExport && (
          <div className="m-dropdown" style={{ top: "100%", right: 0 }}>
            <button className="m-dropdown-item" onClick={() => { exporter.exportHTML(); setShowExport(false) }}>HTML</button>
            <button className="m-dropdown-item" onClick={() => { exporter.exportPNG(); setShowExport(false) }}>PNG (2×)</button>
            <button className="m-dropdown-item" onClick={() => { exporter.exportPDF(); setShowExport(false) }}>PDF</button>
            <button className="m-dropdown-item" onClick={() => { exporter.exportWebM(); setShowExport(false) }}>Video (WebM)</button>
          </div>
        )}
      </div>
    </div>
  )
}
