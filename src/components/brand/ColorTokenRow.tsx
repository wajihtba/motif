// One color token row: swatch button (opens the picker popover) + a precise
// free-text input (oklch/hex/rgba — validated, invalid values never commit).
// The popover holds a large native color input (live drag restyles the whole
// gallery via onLive), an alpha slider when the value carries transparency,
// and preset/harmony swatches for one-click picks. The picker writes hex or
// #rrggbbaa; the text input preserves whatever notation the user typed.

import { useMemo, useState } from "react"
import { THEME_PRESETS, tokenDef } from "@/scene/theme"
import { cssColorToHex, hexWithAlpha, isCssColor } from "@/lib/css-color"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useBrandEditorUi } from "./brand-editor-ui"
import { RowShell, useRafApply } from "./controls"

/** Checkerboard backing so translucent swatches read as translucent. */
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "repeating-conic-gradient(rgba(128,128,128,0.35) 0% 25%, transparent 0% 50%)",
  backgroundSize: "10px 10px",
}

function PresetSwatches({
  token,
  current,
  allTokens,
  onPick,
}: {
  token: string
  current: string
  allTokens: Record<string, string>
  onPick: (v: string) => void
}) {
  // This token's value across the built-in presets + the brand's other
  // current colors ("harmonies"), deduped, current value dropped.
  const options = useMemo(() => {
    const seen = new Set<string>([current])
    const out: { value: string; hint: string }[] = []
    const push = (value: string | undefined, hint: string) => {
      if (!value || seen.has(value)) return
      seen.add(value)
      out.push({ value, hint })
    }
    for (const p of THEME_PRESETS) push(p.theme.tokens[token], p.label)
    for (const [k, v] of Object.entries(allTokens)) {
      if (k !== token && tokenDef(k)?.type === "color")
        push(v, tokenDef(k)?.label ?? k)
    }
    return out.slice(0, 12)
  }, [token, current, allTokens])

  if (!options.length) return null
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Suggestions</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={`${o.hint} — ${o.value}`}
            className="size-6 rounded-full border border-border transition-transform hover:scale-110"
            style={{ ...CHECKER }}
            onClick={() => onPick(o.value)}
          >
            <span
              className="block size-full rounded-full"
              style={{ background: o.value }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ColorTokenRow({
  token,
  label,
  value,
  allTokens,
  onLive,
  onCommit,
}: {
  token: string
  label: string
  value: string
  allTokens: Record<string, string>
  onLive: (v: string) => void
  onCommit: (v: string) => void
}) {
  const { pingToken } = useBrandEditorUi()
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  // Picker drafts: hex + alpha while the popover is interacting.
  const [draft, setDraft] = useState<{ hex: string; alpha: number } | null>(
    null
  )
  const live = useRafApply(onLive)

  const parsed = useMemo(() => cssColorToHex(value), [value])
  const shown = draft ?? parsed ?? { hex: "#000000", alpha: 1 }
  const hasAlpha = (draft?.alpha ?? parsed?.alpha ?? 1) < 1

  const commit = (v: string) => {
    onCommit(v)
    pingToken(token)
  }

  const commitDraft = (d: { hex: string; alpha: number }) => {
    commit(hexWithAlpha(d.hex, d.alpha))
    setDraft(null)
  }

  return (
    <RowShell label={label} token={token}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next && draft) commitDraft(draft)
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Pick ${label}`}
            className="size-7 shrink-0 rounded-full border border-border shadow-sm transition-transform hover:scale-110"
            style={CHECKER}
          >
            <span
              className="block size-full rounded-full"
              style={{
                background: draft
                  ? hexWithAlpha(draft.hex, draft.alpha)
                  : value,
              }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={shown.hex}
              aria-label={`${label} color picker`}
              className="h-10 min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              onChange={(e) => {
                const next = { hex: e.target.value, alpha: shown.alpha }
                setDraft(next)
                live(hexWithAlpha(next.hex, next.alpha))
              }}
            />
            <span className="text-[11px] text-muted-foreground uppercase tabular-nums">
              {hexWithAlpha(shown.hex, shown.alpha)}
            </span>
          </div>
          {hasAlpha && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-[10px] text-muted-foreground">
                  Opacity
                </Label>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(shown.alpha * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[shown.alpha]}
                onValueChange={([a]) => {
                  const next = { hex: shown.hex, alpha: a }
                  setDraft(next)
                  live(hexWithAlpha(next.hex, next.alpha))
                }}
                onValueCommit={([a]) =>
                  commitDraft({ hex: shown.hex, alpha: a })
                }
              />
            </div>
          )}
          <PresetSwatches
            token={token}
            current={value}
            allTokens={allTokens}
            onPick={(v) => {
              setDraft(null)
              commit(v)
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        key={value}
        defaultValue={value}
        placeholder="oklch(…) / #hex / rgba(…)"
        aria-invalid={invalid}
        className={cn(
          "h-7 flex-1 font-mono text-[11px]",
          invalid && "border-destructive ring-1 ring-destructive/40"
        )}
        onChange={(e) => {
          const v = e.target.value.trim()
          setInvalid(v !== "" && !isCssColor(v))
        }}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (!v || v === value) return
          if (!isCssColor(v)) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          commit(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </RowShell>
  )
}
