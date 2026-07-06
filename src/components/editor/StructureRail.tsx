// The structure rail — a collapsible, resizable column between the chat and the
// canvas holding the two document-structure views: the Layers tree and the raw
// Code (scene file) editor. Both are pure views of the document store; this
// component only owns presentation (which tab, how wide, collapsed or not).

import { useEffect, useRef, useState } from "react"
import type { EditorController } from "@/controller"
import type { HoverStore } from "@/hooks/use-hover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { CodePanel } from "@/components/panels/CodePanel"
import { LayersPanel } from "@/components/panels/LayersPanel"

const WIDTH_KEY = "motif.structureRail.width"
const MIN_W = 220
const MAX_W = 560

export function StructureRail({
  ctrl,
  hover,
}: {
  ctrl: EditorController
  hover: HoverStore
}) {
  const [tab, setTab] = useState<"layers" | "code">("layers")
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState<number>(() => readWidth())
  const dragging = useRef(false)

  // Persist the chosen width across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      /* private mode / disabled storage — width simply won't persist */
    }
  }, [width])

  // Global listeners for the resize drag (so it keeps tracking outside the
  // 4px handle).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setWidth(clamp(e.clientX - RAIL_LEFT_HINT(), MIN_W, MAX_W))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  const railRef = useRef<HTMLElement>(null)
  // The left edge of the rail in viewport px (chat rail width) — read live so
  // the drag maps clientX → width correctly regardless of the chat rail.
  function RAIL_LEFT_HINT() {
    return railRef.current?.getBoundingClientRect().left ?? 0
  }

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-r bg-background py-2">
        <button
          type="button"
          title="Show layers & code"
          onClick={() => setCollapsed(false)}
          className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight />
        </button>
        <span className="mt-3 text-[10px] tracking-wider text-muted-foreground [writing-mode:vertical-rl]">
          LAYERS · CODE
        </span>
      </div>
    )
  }

  return (
    <aside
      ref={railRef}
      className="relative flex shrink-0 flex-col border-r bg-background"
      style={{ width }}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "layers" | "code")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <TabsList className="h-7 bg-transparent p-0">
            <RailTab value="layers">Layers</RailTab>
            <RailTab value="code">Code</RailTab>
          </TabsList>
          <button
            type="button"
            title="Collapse panel"
            onClick={() => setCollapsed(true)}
            className="ml-auto flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft />
          </button>
        </div>

        {/* Both panels stay mounted — the Code editor keeps its store bridge and
            expansion state alive while you're on the Layers tab. Visibility is
            toggled with CSS instead of unmount/remount. */}
        <div
          className={cn("min-h-0 flex-1", tab === "layers" ? "flex" : "hidden")}
        >
          <LayersPanel ctrl={ctrl} hover={hover} />
        </div>
        <div
          className={cn("min-h-0 flex-1", tab === "code" ? "flex" : "hidden")}
        >
          <CodePanel ctrl={ctrl} />
        </div>
      </Tabs>

      {/* resize handle on the right edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault()
          dragging.current = true
          document.body.style.cursor = "col-resize"
          document.body.style.userSelect = "none"
        }}
        className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
      />
    </aside>
  )
}

function RailTab({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-7 rounded-sm px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(v) && v >= MIN_W && v <= MAX_W) return v
  } catch {
    /* ignore */
  }
  return 288
}

function ChevronLeft() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M10 3L5 8l5 5"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M6 3l5 5-5 5"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
