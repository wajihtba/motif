// Effects inspector — the layer stack UI, generated from the registry:
// param sliders come from each def's declared params, the picker comes from
// groups(), and every control dispatches the same fx.* commands the agent
// uses. Drop a def into a catalogue file and it appears here automatically.

import { useState } from "react"
import type { EditorController } from "@/controller"
import type { AnyEffectDef, EffectKind } from "@/effects/core/types"
import type { EffectLayer } from "@/scene/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { LOOKS } from "@/content/looks"
import { findEffect, groups } from "@/effects/core/registry"
import "@/effects"
import { useEditorState } from "@/hooks/use-document-store"

const PICKER_KINDS: Array<{ kind: EffectKind; label: string }> = [
  { kind: "scene-shader", label: "Scene shaders" },
  { kind: "element-shader", label: "Element shaders" },
  { kind: "pixel", label: "Pixel" },
  { kind: "filter", label: "Filters" },
]

export function EffectsPanel({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const layers = state.document.scene.effects

  const add = (value: string) => {
    const [kind, effect] = value.split(":")
    ctrl.dispatch({
      command: "fx.add",
      args: { effect, kind },
    })
  }

  const currentLook = layers.find((l) => l.owner === "look")

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Looks
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LOOKS.map((look) => (
            <button
              key={look.name}
              title={look.blurb}
              onClick={() =>
                ctrl.dispatch({
                  command: "look.apply",
                  args: { name: look.name },
                })
              }
              className="rounded-md border px-2 py-1 text-[11px] hover:border-primary/60"
            >
              {look.emoji} {look.label}
            </button>
          ))}
          {currentLook && (
            <button
              onClick={() =>
                ctrl.dispatch({ command: "look.apply", args: { name: "none" } })
              }
              className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive"
            >
              Clear look
            </button>
          )}
        </div>
      </div>

      <Select value="" onValueChange={add}>
        <SelectTrigger className="h-8 w-full text-sm">
          <SelectValue placeholder="Add an effect…" />
        </SelectTrigger>
        <SelectContent>
          {PICKER_KINDS.map(({ kind, label }) => (
            <SelectGroup key={kind}>
              <SelectLabel>{label}</SelectLabel>
              {groups(kind).flatMap((g) =>
                g.items.map((d: AnyEffectDef) => (
                  <SelectItem key={`${kind}:${d.id}`} value={`${kind}:${d.id}`}>
                    {d.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {g.group}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {layers.length === 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Stack effects on the whole canvas or the selected element — or just
          ask the agent for a look.
        </p>
      )}

      {layers.map((layer) => (
        <LayerRow key={layer.id} ctrl={ctrl} layer={layer} />
      ))}
    </div>
  )
}

function LayerRow({
  ctrl,
  layer,
}: {
  ctrl: EditorController
  layer: EffectLayer
}) {
  const def = findEffect(layer.effect, layer.kind)?.def
  const [open, setOpen] = useState(false)
  const patch = (p: Record<string, unknown>) =>
    ctrl.dispatch({ command: "fx.update", args: { id: layer.id, patch: p } })

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={layer.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          className="scale-75"
        />
        <button
          className="flex-1 truncate text-left text-xs font-medium"
          onClick={() => setOpen(!open)}
        >
          {def?.name ?? layer.effect}
        </button>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {targetLabel(layer)}
        </Badge>
        <div className="flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              ctrl.dispatch({
                command: "fx.reorder",
                args: { id: layer.id, direction: "up" },
              })
            }
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              ctrl.dispatch({
                command: "fx.reorder",
                args: { id: layer.id, direction: "down" },
              })
            }
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={() =>
              ctrl.dispatch({ command: "fx.remove", args: { id: layer.id } })
            }
          >
            ✕
          </Button>
        </div>
      </div>

      {open && def && (
        <div className="space-y-2.5 pt-1">
          {def.params.map((p) => (
            <div key={p.key} className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  {p.label}
                </Label>
                <span className="text-[11px] tabular-nums">
                  {(layer.params[p.key] ?? p.def).toFixed(2)}
                </span>
              </div>
              <Slider
                min={p.min}
                max={p.max}
                step={p.step}
                value={[layer.params[p.key] ?? p.def]}
                onValueCommit={([v]) => patch({ params: { [p.key]: v } })}
              />
            </div>
          ))}
          {"animated" in def && def.animated && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch
                checked={layer.animate}
                onCheckedChange={(animate) => patch({ animate })}
                className="scale-75"
              />
              Animate over time
            </label>
          )}
          {layer.effect === "custom" && (
            <CustomGlsl ctrl={ctrl} layer={layer} />
          )}
        </div>
      )}
    </div>
  )
}

function CustomGlsl({
  ctrl,
  layer,
}: {
  ctrl: EditorController
  layer: EffectLayer
}) {
  const [draft, setDraft] = useState(layer.frag ?? "")
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">
        GLSL — vec4 fx()
      </Label>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === layer.frag) return
          const r = ctrl.dispatch({
            command: "fx.update",
            args: { id: layer.id, patch: { frag: draft } },
          })
          setError(r.ok ? null : r.errors.join("\n"))
        }}
        className="min-h-28 font-mono text-[11px]"
        spellCheck={false}
      />
      {error && (
        <pre className="text-[10px] whitespace-pre-wrap text-destructive">
          {error}
        </pre>
      )}
    </div>
  )
}

function targetLabel(layer: EffectLayer): string {
  if (layer.target.type === "canvas") return "canvas"
  if (layer.target.type === "role") return `every ${layer.target.role}`
  return layer.target.ids.length === 1
    ? `#${layer.target.ids[0]}`
    : `${layer.target.ids.length} elements`
}
