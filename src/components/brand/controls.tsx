// Shared control primitives for the brand inspector — the fx-controls
// patterns (LiveSlider's drag-live/commit-on-release, rAF-throttled apply)
// decoupled from the EditorController: the brand page has no gesture/undo
// system, so live updates go straight to in-memory state and commit persists.

import { useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { tokenDef } from "@/scene/theme"
import { componentsUsing } from "@/brand/token-usage"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { useBrandEditorUi } from "./brand-editor-ui"

/** rAF-throttle live values so a drag repaints at most once per frame. */
export function useRafApply(apply: (v: string) => void) {
  const raf = useRef(0)
  const pending = useRef("")
  return (v: string) => {
    pending.current = v
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0
        apply(pending.current)
      })
    }
  }
}

/** Info affordance for one token: what it is, where it applies, and how many
 *  catalog components consume it. Hovering it also focuses the token so the
 *  gallery highlights the affected tiles while you read. */
export function InfoTip({ token }: { token: string }) {
  const def = tokenDef(token)
  const { focusToken } = useBrandEditorUi()
  const usage = componentsUsing(token)
  if (!def) return null
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`About ${def.label}`}
          className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          onPointerEnter={() => focusToken(token)}
          onPointerLeave={() => focusToken(null)}
        >
          <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-64 space-y-1.5">
        <div className="text-xs font-medium">{def.label}</div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {def.description}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="text-foreground/80">Where:</span> {def.appliesTo}
        </p>
        {usage.count > 0 && (
          <p className="text-[10px] text-muted-foreground/80">
            Used by {usage.count} component{usage.count === 1 ? "" : "s"} —
            highlighted in the gallery while you hover here.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

/** Shared row scaffold: label + optional token info tip + the control, with
 *  hover/focus wired to the gallery highlight when a token key is given. */
export function RowShell({
  label,
  token,
  children,
}: {
  label: string
  token?: string
  children: React.ReactNode
}) {
  const { focusToken } = useBrandEditorUi()
  return (
    <div
      className="group/row flex items-center gap-2"
      onPointerEnter={token ? () => focusToken(token) : undefined}
      onPointerLeave={token ? () => focusToken(null) : undefined}
    >
      <span className="flex w-24 shrink-0 items-center gap-1">
        <Label className="truncate text-[11px]">{label}</Label>
        {token && <InfoTip token={token} />}
      </span>
      {children}
    </div>
  )
}

/** Slider with live drag preview and commit-on-release. `onLive` must be
 *  cheap (in-memory only); `onCommit` persists. */
export function BrandSlider({
  label,
  token,
  min,
  max,
  step,
  unit = "",
  value,
  onLive,
  onCommit,
}: {
  label: string
  token?: string
  min: number
  max: number
  step: number
  unit?: string
  value: number
  onLive: (v: number) => void
  onCommit: (v: number) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const raf = useRef(0)
  const pending = useRef(0)
  const shown = drag ?? value
  const { focusToken } = useBrandEditorUi()

  const live = (v: number) => {
    pending.current = v
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0
        onLive(pending.current)
      })
    }
  }

  return (
    <div
      className="space-y-1"
      onPointerEnter={token ? () => focusToken(token) : undefined}
      onPointerLeave={token ? () => focusToken(null) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <Label className="text-[11px]">{label}</Label>
          {token && <InfoTip token={token} />}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {step < 1 ? shown.toFixed(2) : Math.round(shown)}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[shown]}
        onValueChange={([v]) => {
          setDrag(v)
          live(v)
        }}
        onValueCommit={([v]) => {
          if (raf.current) {
            cancelAnimationFrame(raf.current)
            raf.current = 0
          }
          setDrag(null)
          onCommit(v)
        }}
      />
    </div>
  )
}
