// The /brand editor's left rail: identity (name, logo, voice), color tokens,
// type, and shape & depth. Every edit updates the in-memory Brand; the page
// debounce-persists. Token inputs are free text (oklch/hex/rgba all valid CSS)
// with a live swatch.

import { useRef } from "react"
import type { Brand } from "@/brand/types"
import { TOKENS } from "@/scene/theme"
import { primeAssets, putAsset, resolveAsset } from "@/persistence/assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { MotionSection } from "./MotionSection"

const SHADOW_PRESETS = [
  { label: "Soft", value: "0 24px 60px rgba(0,0,0,0.35)" },
  { label: "Hard", value: "12px 12px 0 rgba(0,0,0,0.9)" },
  { label: "None", value: "none" },
]

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function TokenInput({
  label,
  value,
  swatch,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  swatch?: boolean
  placeholder?: string
  onCommit: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-24 shrink-0 text-[11px]">{label}</Label>
      {swatch && (
        <span
          className="size-5 shrink-0 rounded-full border border-border"
          style={{ background: value }}
        />
      )}
      <Input
        key={value}
        defaultValue={value}
        placeholder={placeholder}
        className="h-7 flex-1 font-mono text-[11px]"
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && v !== value) onCommit(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

export function BrandTokenRail({
  brand,
  onChange,
}: {
  brand: Brand
  onChange: (patch: Partial<Brand>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const tokens = brand.theme.tokens

  const setToken = (key: string, value: string) =>
    onChange({ theme: { ...brand.theme, tokens: { ...tokens, [key]: value } } })

  const uploadLogo = async (file: File) => {
    const assetUrl = await putAsset(file, `brand-logo-${brand.id}`)
    await primeAssets()
    onChange({ logo: assetUrl })
  }

  const colorTokens = TOKENS.filter((t) => t.group === "color")
  const fontTokens = TOKENS.filter((t) => t.type === "font")
  const logoUrl = brand.logo ? resolveAsset(brand.logo) : null

  return (
    <div className="space-y-5">
      <Section title="Identity">
        <div className="flex items-center gap-2">
          <button
            className="canvas-well flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border"
            onClick={() => fileRef.current?.click()}
            title={brand.logo ? "Replace logo" : "Upload logo"}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
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
                if (v && v !== brand.name) onChange({ name: v })
              }}
            />
            <div className="text-[10px] text-muted-foreground">
              {brand.logo ? "Logo uploaded" : "Click the tile to add a logo"}
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
            if (v !== (brand.voice ?? "")) onChange({ voice: v || undefined })
          }}
        />
      </Section>

      <Separator />

      <Section title="Colors">
        {colorTokens.map((t) => (
          <TokenInput
            key={t.key}
            label={t.label}
            value={tokens[t.key] ?? ""}
            swatch
            placeholder="oklch(…) / #hex"
            onCommit={(v) => setToken(t.key, v)}
          />
        ))}
      </Section>

      <Separator />

      <Section title="Type">
        {fontTokens.map((t) => (
          <TokenInput
            key={t.key}
            label={t.label}
            value={tokens[t.key] ?? ""}
            placeholder="'Playfair Display', serif"
            onCommit={(v) => setToken(t.key, v)}
          />
        ))}
      </Section>

      <Separator />

      <Section title="Shape & depth">
        <TokenInput
          label="Radius"
          value={tokens["--radius"] ?? ""}
          placeholder="18px"
          onCommit={(v) => setToken("--radius", v)}
        />
        <TokenInput
          label="Spacing unit"
          value={tokens["--space"] ?? ""}
          placeholder="16px"
          onCommit={(v) => setToken("--space", v)}
        />
        <div className="flex items-center gap-2">
          <Label className="w-24 shrink-0 text-[11px]">Shadow</Label>
          <div className="flex gap-1">
            {SHADOW_PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={tokens["--shadow"] === p.value ? "default" : "outline"}
                className="h-6 px-2 text-[10px]"
                onClick={() => setToken("--shadow", p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <TokenInput
          label="Shadow CSS"
          value={tokens["--shadow"] ?? ""}
          placeholder="0 24px 60px rgba(0,0,0,0.35)"
          onCommit={(v) => setToken("--shadow", v)}
        />
      </Section>

      <Separator />

      <MotionSection
        motion={brand.motion}
        onChange={(motion) => onChange({ motion })}
      />
    </div>
  )
}
