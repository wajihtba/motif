// Brand motion personality — entrance, pace, ambient allowance, emphasis, and
// stagger — configured against a live preview: the MotionStage above the
// controls replays the exact preset math on every change, and hovering an
// entrance option auditions it without committing. Preset options come from
// the anim registry, so the agent applies exactly what's previewed.

import { useState } from "react"
import type { BrandMotion } from "@/brand/types"
import { ANIM_PRESETS } from "@/effects/anims/presets"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BrandSlider } from "./controls"
import { MotionStage } from "./MotionStage"

const PACES: { id: NonNullable<BrandMotion["pace"]>; hint: string }[] = [
  { id: "calm", hint: "Slower, more deliberate — durations ×1.5" },
  { id: "standard", hint: "Preset timing as designed" },
  { id: "snappy", hint: "Quick and energetic — durations ×0.65" },
]
const AMBIENTS: { id: NonNullable<BrandMotion["ambient"]>; hint: string }[] = [
  { id: "none", hint: "Everything holds still after entering" },
  { id: "subtle", hint: "A gentle float once elements settle" },
  { id: "lively", hint: "Noticeable float and sway throughout" },
]

export function MotionSection({
  motion,
  tokens,
  onChange,
}: {
  motion: BrandMotion
  /** Brand theme tokens — the stage renders in the brand's own colors. */
  tokens: Record<string, string>
  onChange: (motion: BrandMotion) => void
}) {
  const entrances = ANIM_PRESETS.filter((p) => p.group === "Entrance")
  // "Preferred emphasis preset for CTAs (pulse | heartbeat)" — pulse lives in
  // the Ambient group, so filter by the documented ids, not group alone.
  const emphases = ANIM_PRESETS.filter(
    (p) => p.group === "Emphasis" || p.id === "pulse"
  )
  const [previewEntrance, setPreviewEntrance] = useState<string | null>(null)
  const [liveStagger, setLiveStagger] = useState<number | null>(null)
  const patch = (p: Partial<BrandMotion>) => onChange({ ...motion, ...p })

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        <MotionStage
          motion={motion}
          tokens={tokens}
          previewEntrance={previewEntrance}
          liveStagger={liveStagger}
        />

        <div className="flex items-center gap-2">
          <Label className="w-24 shrink-0 text-[11px]">Entrance</Label>
          <Select
            value={motion.entrance ?? "riseIn"}
            onValueChange={(v) => {
              setPreviewEntrance(null)
              patch({ entrance: v })
            }}
            onOpenChange={(open) => {
              if (!open) setPreviewEntrance(null)
            }}
          >
            <SelectTrigger className="h-7 flex-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entrances.map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  onPointerEnter={() => setPreviewEntrance(p.id)}
                  onPointerLeave={() => setPreviewEntrance(null)}
                  onFocus={() => setPreviewEntrance(p.id)}
                >
                  <span className="flex flex-col items-start">
                    <span>{p.name}</span>
                    {p.blurb && (
                      <span className="text-[10px] text-muted-foreground">
                        {p.blurb}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-24 shrink-0 text-[11px]">Pace</Label>
          <ToggleGroup
            type="single"
            value={motion.pace ?? "standard"}
            onValueChange={(v) => {
              if (v) patch({ pace: v as BrandMotion["pace"] })
            }}
          >
            {PACES.map((p) => (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={p.id}
                    className="h-6 px-2 text-[10px]"
                  >
                    {p.id}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">
                  {p.hint}
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-24 shrink-0 text-[11px]">Ambient</Label>
          <ToggleGroup
            type="single"
            value={motion.ambient ?? "subtle"}
            onValueChange={(v) => {
              if (v) patch({ ambient: v as BrandMotion["ambient"] })
            }}
          >
            {AMBIENTS.map((a) => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={a.id}
                    className="h-6 px-2 text-[10px]"
                  >
                    {a.id}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">
                  {a.hint}
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-24 shrink-0 text-[11px]">Emphasis</Label>
          <Select
            value={motion.emphasis ?? "none"}
            onValueChange={(v) =>
              patch({ emphasis: v === "none" ? undefined : v })
            }
          >
            <SelectTrigger className="h-7 flex-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {emphases.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <BrandSlider
          label="Stagger"
          min={0}
          max={0.5}
          step={0.02}
          unit="s"
          value={liveStagger ?? motion.stagger ?? 0.12}
          onLive={setLiveStagger}
          onCommit={(v) => {
            setLiveStagger(null)
            patch({ stagger: v })
          }}
        />
      </div>
    </TooltipProvider>
  )
}
