// Live param controls shared by the Effects / Animate inspectors.
//
// LiveSlider fixes the "dead slider" problem: the thumb tracks the pointer
// (onValueChange), the document updates live (rAF-throttled dispatch so the
// canvas previews while you drag), and the WHOLE drag coalesces into one undo
// step via the controller's gesture API. ColorField does the same for packed
// 0xRRGGBB color params with a native color picker.

import { useRef, useState } from "react"
import type { EditorController } from "@/controller"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

function useLiveApply(
  ctrl: EditorController,
  gestureLabel: string,
  apply: (v: number) => void
) {
  const inGesture = useRef(false)
  const raf = useRef(0)
  const pending = useRef(0)

  const live = (v: number) => {
    if (!inGesture.current) {
      ctrl.beginGesture(gestureLabel)
      inGesture.current = true
    }
    pending.current = v
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0
        apply(pending.current)
      })
    }
  }
  const commit = (v: number) => {
    if (raf.current) {
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
    apply(v)
    if (inGesture.current) {
      ctrl.endGesture()
      inGesture.current = false
    }
  }
  return { live, commit }
}

export function LiveSlider({
  ctrl,
  label,
  min,
  max,
  step,
  value,
  onApply,
  gestureLabel,
}: {
  ctrl: EditorController
  label: string
  min: number
  max: number
  step: number
  value: number
  onApply: (v: number) => void
  gestureLabel: string
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const { live, commit } = useLiveApply(ctrl, gestureLabel, onApply)
  const shown = drag ?? value

  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {shown.toFixed(step < 1 ? 2 : 0)}
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
          setDrag(null)
          commit(v)
        }}
      />
    </div>
  )
}

const toHex = (n: number) =>
  `#${Math.max(0, Math.min(0xffffff, Math.round(n))).toString(16).padStart(6, "0")}`
const fromHex = (hex: string) => parseInt(hex.slice(1), 16) || 0

export function ColorField({
  ctrl,
  label,
  value,
  onApply,
  gestureLabel,
}: {
  ctrl: EditorController
  label: string
  value: number
  onApply: (v: number) => void
  gestureLabel: string
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const { live, commit } = useLiveApply(ctrl, gestureLabel, onApply)
  const shown = draft ?? value

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tabular-nums text-muted-foreground uppercase">
          {toHex(shown)}
        </span>
        <input
          type="color"
          value={toHex(shown)}
          onChange={(e) => {
            const v = fromHex(e.target.value)
            setDraft(v)
            live(v)
          }}
          onBlur={() => {
            if (draft != null) commit(draft)
            setDraft(null)
          }}
          className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0.5"
        />
      </div>
    </div>
  )
}
