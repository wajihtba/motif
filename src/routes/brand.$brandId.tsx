// /brand/:brandId — the brand editor: token/motion rail on the left, the live
// component gallery on the right. Every rail edit updates the in-memory Brand
// and re-renders all tiles (components reference var(--token), so a token
// change restyles everything); persistence is a debounced putBrand.

import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { Brand, ComponentOverride } from "@/brand/types"
import { groups } from "@/brand/components"
import { brandFileName, exportBrandFile } from "@/brand/brand-file"
import { installAssetResolver, primeAssets } from "@/persistence/assets"
import { getBrand, putBrand } from "@/persistence/brands"
import { THEME_PRESETS } from "@/scene/theme"
import { BrandTokenRail } from "@/components/brand/BrandTokenRail"
import { ComponentTile } from "@/components/brand/ComponentTile"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const Route = createFileRoute("/brand/$brandId")({
  component: BrandEditor,
})

function BrandEditor() {
  const { brandId } = Route.useParams()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [missing, setMissing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    installAssetResolver()
    void (async () => {
      await primeAssets()
      const b = await getBrand(brandId)
      if (b) setBrand(b)
      else setMissing(true)
    })()
  }, [brandId])

  // Debounced autosave — mirrors the editor's Autosaver cadence.
  const save = (next: Brand) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void putBrand(next)
    }, 500)
  }
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  const update = (patch: Partial<Brand>) => {
    setBrand((prev) => {
      if (!prev) return prev
      const next: Brand = { ...prev, ...patch, updatedAt: Date.now() }
      save(next)
      return next
    })
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
    update({
      theme: {
        mode: preset.theme.mode,
        tokens: { ...brand.theme.tokens, ...preset.theme.tokens },
      },
    })
  }

  const buckets = useMemo(() => groups(), [])

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
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Link to="/brand" className="text-xs text-muted-foreground">
          ← Brands
        </Link>
        <span className="text-sm font-medium">{brand.name}</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              Start from preset
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-[11px]">
              Replaces token values
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {THEME_PRESETS.map((p) => (
              <DropdownMenuItem key={p.name} onClick={() => applyPreset(p.name)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
        <aside className="w-80 shrink-0 overflow-y-auto border-r p-4">
          <BrandTokenRail brand={brand} onChange={update} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {buckets.map((bucket) => (
            <section key={bucket.group} className="mb-8">
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
        </main>
      </div>
    </div>
  )
}
