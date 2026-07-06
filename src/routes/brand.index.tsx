// /brand — the brand library: every saved brand as a card (name + token
// swatch strip), with create / duplicate / delete / import. Client-rendered:
// brands live in IndexedDB.

import { useEffect, useRef, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import type { Brand } from "@/brand/types"
import { importBrandFile } from "@/brand/brand-file"
import { installAssetResolver, primeAssets } from "@/persistence/assets"
import {
  deleteBrand,
  duplicateBrand,
  listBrands,
  newBrand,
  putBrand,
} from "@/persistence/brands"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const Route = createFileRoute("/brand/")({ component: BrandLibrary })

const SWATCH_KEYS = [
  "--background",
  "--primary",
  "--accent",
  "--accent-2",
  "--ink",
]

function BrandLibrary() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void listBrands().then(setBrands)
  }
  useEffect(() => {
    installAssetResolver()
    void primeAssets().then(refresh)
  }, [])

  const open = (id: string) => {
    void navigate({ to: "/brand/$brandId", params: { brandId: id } })
  }

  const create = async () => {
    const brand = newBrand()
    await putBrand(brand)
    open(brand.id)
  }

  const importFile = async (file: File) => {
    try {
      const brand = await importBrandFile(JSON.parse(await file.text()))
      await putBrand(brand)
      open(brand.id)
    } catch (e) {
      alert(
        `Could not import brand: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 pt-10 pb-6">
        <Link to="/" className="text-lg font-bold tracking-wide">
          Motif
        </Link>
        <p className="text-sm text-muted-foreground">
          Brands — your design system for image generation.
        </p>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => importRef.current?.click()}
        >
          Import JSON
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ""
          }}
        />
        <Button size="sm" onClick={() => void create()}>
          New brand
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        {brands === null ? null : brands.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-24 text-center">
            <div className="text-2xl font-semibold">Create your first brand</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Set tokens, fonts, motion, and component styles once — every
              project linked to the brand designs itself on-brand.
            </p>
            <Button onClick={() => void create()}>New brand</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {brands.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                onOpen={() => open(b.id)}
                onDuplicate={() => void duplicateBrand(b.id).then(refresh)}
                onDelete={() => void deleteBrand(b.id).then(refresh)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function BrandCard({
  brand,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  brand: Brand
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const tokens = brand.theme.tokens
  return (
    <div className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50">
      <button className="block w-full cursor-pointer text-left" onClick={onOpen}>
        <div className="flex h-24">
          {SWATCH_KEYS.map((key) => (
            <div
              key={key}
              className="flex-1"
              style={{ background: tokens[key] ?? "transparent" }}
            />
          ))}
        </div>
        <div
          className="border-t px-3 py-2 text-lg"
          style={{ fontFamily: tokens["--font-heading"] }}
        >
          {brand.name}
        </div>
      </button>
      <div className="flex items-center gap-2 px-3 pb-2">
        <div className="text-[11px] text-muted-foreground">
          {Object.keys(brand.components).length
            ? `${Object.keys(brand.components).length} customized components`
            : "Default components"}
        </div>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
            >
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
