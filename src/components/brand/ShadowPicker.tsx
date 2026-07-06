// Shadow token control: a grid of visual cards, each rendered with the actual
// box-shadow it would apply — you pick what you see, not a word. A "Custom
// CSS" collapsible keeps the raw escape hatch (auto-open when the current
// value matches no preset). The Glow preset derives from the brand's primary.

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"
import { cssColorToRgba } from "@/lib/css-color"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useBrandEditorUi } from "./brand-editor-ui"
import { InfoTip } from "./controls"

function shadowPresets(primary: string): { label: string; value: string }[] {
  const rgba = cssColorToRgba(primary)
  const glow = rgba
    ? `0 0 40px rgba(${rgba.r},${rgba.g},${rgba.b},0.45)`
    : "0 0 40px rgba(255,255,255,0.35)"
  return [
    { label: "None", value: "none" },
    { label: "Soft", value: "0 24px 60px rgba(0,0,0,0.35)" },
    { label: "Floating", value: "0 8px 24px rgba(0,0,0,0.25)" },
    { label: "Hard", value: "12px 12px 0 rgba(0,0,0,0.9)" },
    { label: "Outline", value: "0 0 0 2px rgba(0,0,0,0.9)" },
    { label: "Glow", value: glow },
  ]
}

export function ShadowPicker({
  value,
  primary,
  onCommit,
}: {
  value: string
  /** Current --primary value — drives the Glow preset. */
  primary: string
  onCommit: (v: string) => void
}) {
  const { pingToken, focusToken } = useBrandEditorUi()
  const presets = useMemo(() => shadowPresets(primary), [primary])
  const isPreset = presets.some((p) => p.value === value)
  const [customOpen, setCustomOpen] = useState(!isPreset)

  const commit = (v: string) => {
    onCommit(v)
    pingToken("--shadow")
  }

  return (
    <div
      className="space-y-2"
      onPointerEnter={() => focusToken("--shadow")}
      onPointerLeave={() => focusToken(null)}
    >
      <span className="flex items-center gap-1">
        <Label className="text-[11px]">Shadow</Label>
        <InfoTip token="--shadow" />
      </span>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => commit(p.value)}
            className={cn(
              "canvas-well group/shadow flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors",
              value === p.value
                ? "border-primary ring-1 ring-primary/50"
                : "border-border hover:border-primary/40"
            )}
          >
            <span
              className="size-6 rounded-md bg-card"
              style={{ boxShadow: p.value === "none" ? undefined : p.value }}
            />
            <span className="text-[10px] text-muted-foreground">{p.label}</span>
          </button>
        ))}
      </div>
      <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground">
          <HugeiconsIcon
            icon={customOpen ? ArrowUp01Icon : ArrowDown01Icon}
            className="size-3"
          />
          Custom shadow CSS
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1.5">
          <Input
            key={value}
            defaultValue={value}
            placeholder="0 24px 60px rgba(0,0,0,0.35)"
            className="h-7 font-mono text-[11px]"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== value) commit(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
