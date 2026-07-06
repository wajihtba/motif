// The brand editor's left inspector: a sticky icon nav over accordion
// sections — Identity, Colors, Typography, Shape & depth, Motion. Every
// control distinguishes live edits (in-memory restyle while dragging) from
// commits (persisted, ping the gallery). Replaces the old BrandTokenRail.

import { useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  ColorsIcon,
  IdentityCardIcon,
  MotionIcon,
  Shapes01Icon,
  TextFontIcon,
} from "@hugeicons/core-free-icons"
import type { Brand } from "@/brand/types"
import { TOKENS } from "@/scene/theme"
import { primeAssets, putAsset, resolveAsset } from "@/persistence/assets"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ColorTokenRow } from "./ColorTokenRow"
import { FontTokenRow } from "./FontTokenRow"
import { ShapeSection } from "./ShapeSection"
import { MotionSection } from "./MotionSection"
import { useBrandEditorUi } from "./brand-editor-ui"

const SECTIONS: { id: string; label: string; icon: IconSvgElement }[] = [
  { id: "identity", label: "Identity", icon: IdentityCardIcon },
  { id: "colors", label: "Colors", icon: ColorsIcon },
  { id: "type", label: "Typography", icon: TextFontIcon },
  { id: "shape", label: "Shape & depth", icon: Shapes01Icon },
  { id: "motion", label: "Motion", icon: MotionIcon },
]
const ALL_OPEN = SECTIONS.map((s) => s.id)

export function BrandInspector({
  brand,
  onCommit,
  onLive,
}: {
  brand: Brand
  /** Persisting update — schedules the debounced save. */
  onCommit: (patch: Partial<Brand>) => void
  /** In-memory update while a control drags — no save scheduled. */
  onLive: (patch: Partial<Brand>) => void
}) {
  const { pingToken } = useBrandEditorUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [open, setOpen] = useState<string[]>(ALL_OPEN)
  const tokens = brand.theme.tokens

  const themePatch = (key: string, value: string): Partial<Brand> => ({
    theme: { ...brand.theme, tokens: { ...tokens, [key]: value } },
  })
  const commitToken = (key: string, value: string) => {
    onCommit(themePatch(key, value))
    pingToken(key)
  }
  const liveToken = (key: string, value: string) =>
    onLive(themePatch(key, value))

  const uploadLogo = async (file: File) => {
    const assetUrl = await putAsset(file, `brand-logo-${brand.id}`)
    await primeAssets()
    onCommit({ logo: assetUrl })
  }

  const jumpTo = (id: string) => {
    setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]))
    // Wait a beat so a just-opened accordion section has height to scroll to.
    requestAnimationFrame(() => {
      sectionRefs.current[id]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
  }

  const colorTokens = TOKENS.filter((t) => t.group === "color")
  const fontTokens = TOKENS.filter((t) => t.type === "font")
  const logoUrl = brand.logo ? resolveAsset(brand.logo) : null

  return (
    <TooltipProvider delayDuration={300}>
      {/* Sticky icon nav — one tap to open + jump to any section. */}
      <div className="sticky top-0 z-10 -mx-4 mb-1 flex items-center gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur">
        {SECTIONS.map((s) => (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={s.label}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => jumpTo(s.id)}
              >
                <HugeiconsIcon icon={s.icon} className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">
              {s.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Accordion type="multiple" value={open} onValueChange={setOpen}>
        <AccordionItem
          value="identity"
          ref={(el) => {
            sectionRefs.current.identity = el
          }}
          className="scroll-mt-14"
        >
          <AccordionTrigger className="text-xs">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={IdentityCardIcon}
                className="size-4 text-muted-foreground"
              />
              Identity
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2.5">
            <div className="flex items-center gap-2">
              <button
                className="canvas-well flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border"
                onClick={() => fileRef.current?.click()}
                title={brand.logo ? "Replace logo" : "Upload logo"}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-lg text-muted-foreground">+</span>
                )}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  key={brand.name}
                  defaultValue={brand.name}
                  className="h-7 text-xs font-medium"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== brand.name) onCommit({ name: v })
                  }}
                />
                <div className="text-[10px] text-muted-foreground">
                  {brand.logo
                    ? "Logo uploaded"
                    : "Click the tile to add a logo"}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadLogo(f)
                  e.target.value = ""
                }}
              />
            </div>
            <Textarea
              key={brand.voice ?? ""}
              defaultValue={brand.voice ?? ""}
              placeholder="Tone of voice — confident, warm, no exclamation marks…"
              className="min-h-14 text-[11px]"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (brand.voice ?? ""))
                  onCommit({ voice: v || undefined })
              }}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="colors"
          ref={(el) => {
            sectionRefs.current.colors = el
          }}
          className="scroll-mt-14"
        >
          <AccordionTrigger className="text-xs">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ColorsIcon}
                className="size-4 text-muted-foreground"
              />
              Colors
              <span className="ml-1 flex items-center gap-0.5">
                {[
                  "--background",
                  "--primary",
                  "--accent",
                  "--accent-2",
                  "--ink",
                ].map((k) => (
                  <span
                    key={k}
                    className="size-2 rounded-full border border-border/60"
                    style={{ background: tokens[k] }}
                  />
                ))}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2.5">
            {colorTokens.map((t) => (
              <ColorTokenRow
                key={t.key}
                token={t.key}
                label={t.label}
                value={tokens[t.key] ?? ""}
                allTokens={tokens}
                onLive={(v) => liveToken(t.key, v)}
                onCommit={(v) => commitToken(t.key, v)}
              />
            ))}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="type"
          ref={(el) => {
            sectionRefs.current.type = el
          }}
          className="scroll-mt-14"
        >
          <AccordionTrigger className="text-xs">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={TextFontIcon}
                className="size-4 text-muted-foreground"
              />
              Typography
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            {fontTokens.map((t) => (
              <FontTokenRow
                key={t.key}
                token={t.key}
                label={t.label}
                value={tokens[t.key] ?? ""}
                onCommit={(v) => commitToken(t.key, v)}
              />
            ))}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="shape"
          ref={(el) => {
            sectionRefs.current.shape = el
          }}
          className="scroll-mt-14"
        >
          <AccordionTrigger className="text-xs">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Shapes01Icon}
                className="size-4 text-muted-foreground"
              />
              Shape & depth
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ShapeSection
              tokens={tokens}
              onLiveToken={liveToken}
              onCommitToken={(k, v) => commitToken(k, v)}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="motion"
          ref={(el) => {
            sectionRefs.current.motion = el
          }}
          className="scroll-mt-14 border-b-0"
        >
          <AccordionTrigger className="text-xs">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={MotionIcon}
                className="size-4 text-muted-foreground"
              />
              Motion
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <MotionSection
              motion={brand.motion}
              tokens={tokens}
              onChange={(motion) => onCommit({ motion })}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </TooltipProvider>
  )
}
