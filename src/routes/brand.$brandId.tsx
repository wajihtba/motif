// /brand/:brandId — the brand editor: inspector on the left (accordion of
// identity/colors/type/shape/motion with live-drag controls), the live
// component gallery on the right (spotlight hero + registry groups with a
// scrollspy chip nav). Live edits update the in-memory Brand only; commits
// debounce-persist. Token edits restyle every tile through CSS custom
// properties (no DOM rebuilds), and the editor-ui context highlights/pings
// the tiles a token actually affects.

import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import type { Brand, ComponentOverride } from "@/brand/types"
import { groups } from "@/brand/components"
import { brandFileName, exportBrandFile } from "@/brand/brand-file"
import { installAssetResolver, primeAssets } from "@/persistence/assets"
import { getBrand, putBrand } from "@/persistence/brands"
import { THEME_PRESETS } from "@/scene/theme"
import { ensureStackLoaded } from "@/lib/brand-fonts"
import { cn } from "@/lib/utils"
import { BrandEditorUiProvider } from "@/components/brand/brand-editor-ui"
import { BrandInspector } from "@/components/brand/BrandInspector"
import { ComponentTile } from "@/components/brand/ComponentTile"
import { SpotlightCard } from "@/components/brand/SpotlightCard"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export const Route = createFileRoute("/brand/$brandId")({
  component: BrandEditor,
})

const slug = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, "-")

function PresetPicker({ onApply }: { onApply: (name: string) => void }) {
  const DOT_KEYS = [
    "--background",
    "--primary",
    "--accent",
    "--accent-2",
    "--ink",
  ]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          Start from preset
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-1.5">
        <div className="text-[11px] text-muted-foreground">
          Replaces token values — components and motion stay.
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onApply(p.name)}
              className="flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/50"
              style={{ background: p.theme.tokens["--background"] }}
            >
              <span
                className="text-sm leading-none"
                style={{
                  color: p.theme.tokens["--ink"],
                  fontFamily: p.theme.tokens["--font-heading"],
                }}
              >
                Aa
              </span>
              <span className="flex items-center gap-1">
                {DOT_KEYS.map((k) => (
                  <span
                    key={k}
                    className="size-2.5 rounded-full border border-white/20"
                    style={{ background: p.theme.tokens[k] }}
                  />
                ))}
              </span>
              <span
                className="text-[10px]"
                style={{ color: p.theme.tokens["--foreground"] }}
              >
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function BrandEditor() {
  const { brandId } = Route.useParams()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  useEffect(() => {
    installAssetResolver()
    void (async () => {
      await primeAssets()
      const b = await getBrand(brandId)
      if (b) {
        setBrand(b)
        // Load the web fonts behind the brand's stacks so the gallery renders
        // the real faces (presets referenced never-loaded families before).
        ensureStackLoaded(b.theme.tokens["--font-heading"] ?? "")
        ensureStackLoaded(b.theme.tokens["--font-body"] ?? "")
      } else setMissing(true)
    })()
  }, [brandId])

  // Debounced autosave — mirrors the editor's Autosaver cadence.
  const save = (next: Brand) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState("saving")
    saveTimer.current = setTimeout(() => {
      void putBrand(next).then(() => setSaveState("saved"))
    }, 500)
  }
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  /** Committing update: bumps updatedAt and schedules the debounced save. */
  const update = (patch: Partial<Brand>) => {
    setBrand((prev) => {
      if (!prev) return prev
      const next: Brand = { ...prev, ...patch, updatedAt: Date.now() }
      save(next)
      return next
    })
  }

  /** Live update while a control drags: restyle previews, save nothing. */
  const updateLive = (patch: Partial<Brand>) => {
    setBrand((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const setOverride = (id: string, override: ComponentOverride | null) => {
    if (!brand) return
    const components = { ...brand.components }
    if (override) components[id] = override
    else delete components[id]
    update({ components })
  }

  const exportJson = async () => {
    if (!brand) return
    const file = await exportBrandFile(brand)
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = brandFileName(brand)
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyPreset = (name: string) => {
    const preset = THEME_PRESETS.find((p) => p.name === name)
    if (!preset || !brand) return
    ensureStackLoaded(preset.theme.tokens["--font-heading"] ?? "")
    ensureStackLoaded(preset.theme.tokens["--font-body"] ?? "")
    update({
      theme: {
        mode: preset.theme.mode,
        tokens: { ...brand.theme.tokens, ...preset.theme.tokens },
      },
    })
  }

  const buckets = useMemo(() => groups(), [])

  // Scrollspy: track which gallery section owns the viewport top.
  useEffect(() => {
    const main = mainRef.current
    if (!main || !brand) return
    const sections = [...main.querySelectorAll("[data-group-section]")]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting)
            setActiveGroup(e.target.getAttribute("data-group-section"))
        }
      },
      { root: main, rootMargin: "0px 0px -75% 0px", threshold: 0 }
    )
    for (const s of sections) observer.observe(s)
    return () => observer.disconnect()
  }, [brand === null])

  const jumpToGroup = (group: string) => {
    mainRef.current
      ?.querySelector(`[data-group-section="${slug(group)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (missing) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background">
        <div className="text-sm text-muted-foreground">Brand not found.</div>
        <Button asChild variant="outline" size="sm">
          <Link to="/brand">Back to brands</Link>
        </Button>
      </div>
    )
  }
  if (!brand) return <div className="min-h-svh bg-background" />

  return (
    <BrandEditorUiProvider>
      <div className="flex h-svh flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <Link to="/brand" className="text-xs text-muted-foreground">
            ← Brands
          </Link>
          <span className="text-sm font-medium">{brand.name}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {saveState === "saving" && (
              <>
                <Spinner className="size-3" /> Saving…
              </>
            )}
            {saveState === "saved" && (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-3 text-primary"
                />
                Saved
              </>
            )}
          </span>
          <div className="flex-1" />
          <PresetPicker onApply={applyPreset} />
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => void exportJson()}
          >
            Export JSON
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-96 shrink-0 overflow-y-auto border-r px-4 pb-4">
            <BrandInspector
              brand={brand}
              onCommit={update}
              onLive={updateLive}
            />
          </aside>

          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
            {/* Sticky group nav — scrollspy highlights the section in view. */}
            <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-background/95 px-6 py-2 backdrop-blur">
              {buckets.map((bucket) => (
                <button
                  key={bucket.group}
                  type="button"
                  onClick={() => jumpToGroup(bucket.group)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    activeGroup === slug(bucket.group)
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {bucket.group}
                </button>
              ))}
            </div>

            <div className="p-6">
              <SpotlightCard brand={brand} />

              {buckets.map((bucket) => (
                <section
                  key={bucket.group}
                  data-group-section={slug(bucket.group)}
                  className="mb-8 scroll-mt-12"
                >
                  <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {bucket.group}
                  </h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                    {bucket.items.map((def) => (
                      <ComponentTile
                        key={def.id}
                        def={def}
                        brand={brand}
                        onOverride={setOverride}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>
    </BrandEditorUiProvider>
  )
}
