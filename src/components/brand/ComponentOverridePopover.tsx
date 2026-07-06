// Per-component override editor: variant axes as radio rows, a raw-CSS
// escape hatch (sanitized on apply), hide-from-brand, and reset. Writes a
// ComponentOverride back to the brand record — never touches the registry.

import { useState } from "react"
import type { ComponentDef } from "@/brand/components"
import type { ComponentOverride } from "@/brand/types"
import { defaultVariants } from "@/brand/components"
import { cssTextFromRecord, parseCssText } from "@/brand/css-text"
import { sanitizeCss } from "@/scene/validate"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

function prune(override: ComponentOverride): ComponentOverride | null {
  const out: ComponentOverride = {}
  if (override.variants && Object.keys(override.variants).length)
    out.variants = override.variants
  if (override.css && Object.keys(override.css).length) out.css = override.css
  if (override.hidden) out.hidden = true
  return Object.keys(out).length ? out : null
}

export function ComponentOverridePopover({
  def,
  override,
  onChange,
}: {
  def: ComponentDef
  override: ComponentOverride | undefined
  onChange: (next: ComponentOverride | null) => void
}) {
  const defaults = defaultVariants(def)
  const [cssDraft, setCssDraft] = useState<string | null>(null)
  const cssText = cssDraft ?? cssTextFromRecord(override?.css ?? {})

  const patch = (p: Partial<ComponentOverride>) =>
    onChange(prune({ ...override, ...p }))

  const setVariant = (axisKey: string, optionId: string) => {
    const variants = { ...override?.variants }
    if (optionId === defaults[axisKey]) delete variants[axisKey]
    else variants[axisKey] = optionId
    patch({ variants })
  }

  const applyCss = () => {
    if (cssDraft === null) return
    const { value } = sanitizeCss(parseCssText(cssDraft))
    patch({ css: value })
    setCssDraft(null)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-xs">
        <div className="text-xs font-medium">{def.name}</div>

        {(def.variants ?? []).map((axis) => {
          const selected = override?.variants?.[axis.key] ?? defaults[axis.key]
          return (
            <div key={axis.key} className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {axis.label}
              </Label>
              <ToggleGroup
                type="single"
                value={selected}
                onValueChange={(v) => {
                  if (v) setVariant(axis.key, v)
                }}
                className="justify-start"
              >
                {axis.options.map((o) => (
                  <ToggleGroupItem
                    key={o.id}
                    value={o.id}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )
        })}

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Extra CSS (applied to the surface)
          </Label>
          <Textarea
            value={cssText}
            placeholder={"text-transform: uppercase;\nletter-spacing: 0.1em;"}
            className="min-h-16 font-mono text-[11px]"
            onChange={(e) => setCssDraft(e.target.value)}
            onBlur={applyCss}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={override?.hidden === true}
            onCheckedChange={(hidden) => patch({ hidden })}
            id={`hide-${def.id}`}
          />
          <Label htmlFor={`hide-${def.id}`} className="text-[11px]">
            Hide from this brand
          </Label>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={!override}
            onClick={() => {
              setCssDraft(null)
              onChange(null)
            }}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
