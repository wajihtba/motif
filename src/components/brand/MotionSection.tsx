// Brand motion personality: entrance preset, pace, ambient allowance, and
// stagger. Preset options come from the anim registry's Entrance group — the
// same ids anim.add consumes, so the agent applies exactly what's previewed.

import type { BrandMotion } from "@/brand/types"
import { ANIM_PRESETS } from "@/effects/anims/presets"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

const PACES: NonNullable<BrandMotion["pace"]>[] = ["calm", "standard", "snappy"]
const AMBIENTS: NonNullable<BrandMotion["ambient"]>[] = [
  "none",
  "subtle",
  "lively",
]

export function MotionSection({
  motion,
  onChange,
}: {
  motion: BrandMotion
  onChange: (motion: BrandMotion) => void
}) {
  const entrances = ANIM_PRESETS.filter((p) => p.group === "Entrance")
  const patch = (p: Partial<BrandMotion>) => onChange({ ...motion, ...p })

  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Motion
      </h3>

      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0 text-[11px]">Entrance</Label>
        <Select
          value={motion.entrance ?? "riseIn"}
          onValueChange={(v) => patch({ entrance: v })}
        >
          <SelectTrigger className="h-7 flex-1 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {entrances.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
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
            <ToggleGroupItem key={p} value={p} className="h-6 px-2 text-[10px]">
              {p}
            </ToggleGroupItem>
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
            <ToggleGroupItem key={a} value={a} className="h-6 px-2 text-[10px]">
              {a}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0 text-[11px]">
          Stagger {(motion.stagger ?? 0.12).toFixed(2)}s
        </Label>
        <Slider
          value={[motion.stagger ?? 0.12]}
          min={0}
          max={0.5}
          step={0.02}
          className="flex-1"
          onValueChange={([v]) => patch({ stagger: v })}
        />
      </div>
    </section>
  )
}
