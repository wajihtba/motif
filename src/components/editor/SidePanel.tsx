import { useState, useCallback } from "react"
import { interaction, kernel, store } from "~/lib/motif"
import { getComponentsByCategory } from "~/lib/motif/components"
import { useMotifState } from "~/hooks/useMotif"
import type { ComponentDef } from "~/lib/motif/types"

type Tab = "slides" | "components"

export function SidePanel() {
  const [tab, setTab] = useState<Tab>("slides")

  return (
    <div className="m-sidepanel">
      <div className="m-sidepanel-tabs">
        <button
          className={`m-tab ${tab === "slides" ? "active" : ""}`}
          onClick={() => setTab("slides")}
        >
          Slides
        </button>
        <button
          className={`m-tab ${tab === "components" ? "active" : ""}`}
          onClick={() => setTab("components")}
        >
          Components
        </button>
      </div>
      <div className="m-sidepanel-body">
        {tab === "slides" ? <SlidesTab /> : <ComponentsTab />}
      </div>
    </div>
  )
}

function SlidesTab() {
  const { slides, activeSlideId } = useMotifState()

  return (
    <div className="m-slides-list">
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`m-slide-thumb ${s.id === activeSlideId ? "active" : ""}`}
          onClick={() => store.switchSlide(s.id)}
        >
          <span className="m-slide-num">{i + 1}</span>
          <span className="m-slide-name">{s.name}</span>
          {slides.length > 1 && (
            <button
              className="m-slide-del"
              onClick={(e) => {
                e.stopPropagation()
                store.deleteSlide(s.id)
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        className="m-btn-sm"
        style={{ width: "100%", marginTop: 8 }}
        onClick={() => store.createSlide()}
      >
        + Add Slide
      </button>
    </div>
  )
}

function ComponentsTab() {
  const cats = getComponentsByCategory()
  const [dragging, setDragging] = useState<ComponentDef | null>(null)

  const onDragStart = useCallback(
    (e: React.DragEvent, def: ComponentDef) => {
      setDragging(def)
      e.dataTransfer.setData("text/plain", def.name)
      e.dataTransfer.effectAllowed = "copy"
    },
    []
  )

  const onDragEnd = useCallback(() => {
    setDragging(null)
  }, [])

  return (
    <div className="m-comp-lib">
      {Object.entries(cats).map(([cat, defs]) => (
        <div key={cat} className="m-comp-category">
          <div className="m-comp-cat-title">
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </div>
          <div className="m-comp-grid">
            {defs.map((def) => (
              <div
                key={def.name}
                className="m-comp-item"
                draggable
                onDragStart={(e) => onDragStart(e, def)}
                onDragEnd={onDragEnd}
                onClick={() => {
                  const slide = store.active()
                  if (!slide) return
                  const id = kernel.addComponent(
                    slide.id,
                    def,
                    100 + Math.random() * 200,
                    100 + Math.random() * 200
                  )
                  if (id) interaction.select(id)
                }}
              >
                <span className="m-comp-icon">{def.icon}</span>
                <span className="m-comp-name">{def.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
