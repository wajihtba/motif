// The editor's brand menu: shows the linked brand, links/switches brands from
// the global library, re-syncs the snapshot, and jumps to the /brand editor.
// Linking dispatches brand.apply with the compiled snapshot — the same
// command the agent uses, so it's one undo step.

import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import type { Brand } from "@/brand/types"
import type { EditorController } from "@/controller"
import { compileBrand } from "@/brand/compile"
import { listBrands } from "@/persistence/brands"
import { primeAssets } from "@/persistence/assets"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEditorState } from "@/hooks/use-document-store"

export function BrandMenu({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const snap = state.document.brand
  const [brands, setBrands] = useState<Brand[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) void listBrands().then(setBrands)
  }, [open])

  const linked = brands.find((b) => b.id === snap?.brandId)
  const label = linked?.name ?? (snap?.brandId ? "Brand" : "No brand")

  const applyBrand = async (brand: Brand) => {
    await primeAssets() // the brand logo asset must resolve in this tab
    const compiled = compileBrand(brand)
    ctrl.dispatch(
      {
        command: "brand.apply",
        args: {
          brandId: compiled.brandId,
          syncedAt: compiled.syncedAt,
          palette: compiled.tokens,
          voice: compiled.voice,
          logo: compiled.logo,
          components: compiled.components,
          motion: compiled.motion,
        },
      },
      { label: `Brand: ${brand.name}` }
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px]">
          {snap?.brandId
            ? `Linked: ${linked?.name ?? snap.brandId}`
            : "Link a brand"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brands.length === 0 && (
          <DropdownMenuItem disabled className="text-xs">
            No brands yet
          </DropdownMenuItem>
        )}
        {brands.map((b) => (
          <DropdownMenuItem
            key={b.id}
            className="text-xs"
            onClick={() => void applyBrand(b)}
          >
            <span
              className="mr-1 size-3 rounded-full border border-border"
              style={{ background: b.theme.tokens["--primary"] }}
            />
            {b.name}
            {b.id === snap?.brandId && (
              <span className="ml-auto text-muted-foreground">linked</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {linked && (
          <DropdownMenuItem
            className="text-xs"
            onClick={() => void applyBrand(linked)}
          >
            Sync from brand
          </DropdownMenuItem>
        )}
        {snap?.brandId ? (
          <DropdownMenuItem asChild className="text-xs">
            <Link to="/brand/$brandId" params={{ brandId: snap.brandId }}>
              Edit brand →
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="text-xs">
            <Link to="/brand">Open brand library →</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
