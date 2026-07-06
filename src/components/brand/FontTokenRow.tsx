// Font token control: the trigger shows the current family rendered in
// itself; the popover lists curated choices, each drawn in its own typeface
// (opening the list lazy-loads all curated Google families once, display=swap
// so items fill in as they arrive). A "custom stack" input keeps arbitrary
// font-family strings possible. Selecting commits the full stack and ensures
// the web font is loaded so the gallery immediately renders the real face.

import { useMemo, useState } from "react"
import {
  FONT_CHOICES,
  ensureFontLoaded,
  ensureStackLoaded,
  fontChoiceFor,
  primaryFamily,
} from "@/lib/brand-fonts"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { useBrandEditorUi } from "./brand-editor-ui"
import { RowShell } from "./controls"

const CATEGORY_LABEL: Record<string, string> = {
  serif: "Serif",
  sans: "Sans",
  display: "Display",
  mono: "Mono",
}

export function FontTokenRow({
  token,
  label,
  value,
  onCommit,
}: {
  token: string
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  const { pingToken } = useBrandEditorUi()
  const [open, setOpen] = useState(false)
  const current = fontChoiceFor(value)
  const currentLabel = current?.label ?? (primaryFamily(value) || "Custom")

  const byCategory = useMemo(() => {
    const out: { category: string; items: typeof FONT_CHOICES }[] = []
    for (const c of FONT_CHOICES) {
      let bucket = out.find((b) => b.category === c.category)
      if (!bucket) out.push((bucket = { category: c.category, items: [] }))
      bucket.items.push(c)
    }
    return out
  }, [])

  const commit = (v: string) => {
    ensureStackLoaded(v)
    onCommit(v)
    pingToken(token)
    setOpen(false)
  }

  return (
    <div className="space-y-1.5">
      <RowShell label={label} token={token}>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            // Load every curated face once so the list previews itself.
            if (next)
              for (const c of FONT_CHOICES)
                if (c.googleQuery) ensureFontLoaded(c.googleQuery)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 text-left transition-colors hover:border-primary/40"
            >
              <span className="truncate text-sm" style={{ fontFamily: value }}>
                Aa · {currentLabel}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="max-h-80 overflow-y-auto p-1.5">
              {byCategory.map((bucket) => (
                <div key={bucket.category}>
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {CATEGORY_LABEL[bucket.category] ?? bucket.category}
                  </div>
                  {bucket.items.map((c) => {
                    const selected = current?.label === c.label
                    return (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => commit(c.stack)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
                          selected && "bg-accent/40"
                        )}
                      >
                        <span
                          className="truncate text-base leading-tight"
                          style={{ fontFamily: c.stack }}
                        >
                          {c.label}
                        </span>
                        {selected && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            className="size-3.5 shrink-0 text-primary"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="mt-1.5 space-y-1 border-t px-2 pt-2 pb-1">
                <Label className="text-[10px] text-muted-foreground">
                  Custom stack
                </Label>
                <Input
                  key={value}
                  defaultValue={value}
                  placeholder="'Playfair Display', serif"
                  className="h-7 font-mono text-[11px]"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== value) commit(v)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                  }}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </RowShell>
      <div
        className="truncate pl-[104px] text-xs text-muted-foreground/80"
        style={{ fontFamily: value }}
      >
        The quick brown fox — 0123456789
      </div>
    </div>
  )
}
