// Animate inspector — motion tracks. Presets come from the anim catalog; a
// track is preset + target + a seconds window (start/duration/stagger). No
// keyframe editing here by design — tracks are preset instances (the
// keyframe escape hatch is agent/JSON territory).

import type { EditorController } from "@/controller"
import type { AnimTrack } from "@/scene/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ANIM_PRESETS, animPreset } from "@/effects/anims/presets"
import { useEditorState } from "@/hooks/use-document-store"

const GROUPS = ["Entrance", "Ambient", "Emphasis"] as const

export function AnimatePanel({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const tracks = state.document.scene.animations
  const hasSelection = state.selection.length > 0

  return (
    <div className="space-y-3 p-3">
      <Select
        value=""
        onValueChange={(preset) =>
          ctrl.dispatch({ command: "anim.add", args: { preset } })
        }
      >
        <SelectTrigger className="h-8 w-full text-sm" disabled={!hasSelection}>
          <SelectValue
            placeholder={
              hasSelection
                ? "Add motion to selection…"
                : "Select an element first"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {GROUPS.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {ANIM_PRESETS.filter((p) => p.group === g).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {tracks.length === 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Give elements entrances, ambient motion or emphasis — then press play
          on the timeline. Motion exports as video with M5.
        </p>
      )}

      {tracks.map((track) => (
        <TrackRow key={track.id} ctrl={ctrl} track={track} />
      ))}
    </div>
  )
}

function TrackRow({
  ctrl,
  track,
}: {
  ctrl: EditorController
  track: AnimTrack
}) {
  const preset = animPreset(track.preset)
  const patch = (p: Record<string, unknown>) =>
    ctrl.dispatch({ command: "anim.update", args: { id: track.id, patch: p } })

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={track.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          className="scale-75"
        />
        <span className="flex-1 truncate text-xs font-medium">
          {preset?.name ?? "Keyframes"}
        </span>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {targetLabel(track)}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={() =>
            ctrl.dispatch({ command: "anim.remove", args: { id: track.id } })
          }
        >
          ✕
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Start (s)"
          value={track.start ?? 0}
          onCommit={(start) => patch({ start })}
        />
        <NumberField
          label="Duration (s)"
          value={track.duration ?? presetNaturalDuration(track)}
          onCommit={(duration) => patch({ duration })}
        />
      </div>
    </div>
  )
}

function presetNaturalDuration(track: AnimTrack): number {
  const d = track.params?.duration
  return typeof d === "number" && d > 0 ? d : 1
}

function targetLabel(track: AnimTrack): string {
  if (track.target.type === "role") return `every ${track.target.role}`
  if (track.target.type === "elements") {
    return track.target.ids.length === 1
      ? `#${track.target.ids[0]}`
      : `${track.target.ids.length} elements`
  }
  return "canvas"
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={0.1}
        min={0}
        defaultValue={value}
        key={value}
        className="h-7 text-xs"
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}
