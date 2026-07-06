// One catalog tile on the /brand page: the component rendered live under the
// brand's tokens (plain DOM via ScenePreview — components are static HTML/CSS,
// no canvas needed), with the override editor in a popover.

import { useMemo } from "react"
import type { Brand, ComponentOverride } from "@/brand/types"
import type { ComponentDef } from "@/brand/components"
import type { Scene } from "@/scene/types"
import { instantiate } from "@/brand/components"
import { emptyScene } from "@/scene/model"
import { ScenePreview } from "@/components/ScenePreview"
import { cn } from "@/lib/utils"
import { ComponentOverridePopover } from "./ComponentOverridePopover"

export function tileScene(def: ComponentDef, brand: Brand): Scene | null {
  const { w, h } = def.preview ?? { w: 500, h: 300 }
  const scene = emptyScene(w, h)
  scene.theme = {
    mode: brand.theme.mode,
    tokens: { ...scene.theme.tokens, ...brand.theme.tokens },
  }
  const built = instantiate(def.id, {
    override: brand.components[def.id],
    logo: brand.logo,
  })
  if (!built) return null
  scene.root.children = [built.node]
  return scene
}

export function ComponentTile({
  def,
  brand,
  onOverride,
}: {
  def: ComponentDef
  brand: Brand
  onOverride: (id: string, override: ComponentOverride | null) => void
}) {
  // Index access without noUncheckedIndexedAccess — annotate the miss case.
  const override = brand.components[def.id] as ComponentOverride | undefined
  const hidden = override?.hidden === true
  const customized =
    !!override &&
    ((override.variants && Object.keys(override.variants).length > 0) ||
      (override.css && Object.keys(override.css).length > 0))

  // Rebuild only when the brand actually changes (tokens resolve in CSS, but
  // overrides/logo change the built nodes themselves).
  const scene = useMemo(() => tileScene(def, brand), [def, brand])

  return (
    <div
      className={cn(
        "group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50",
        hidden && "opacity-40"
      )}
    >
      <div className="canvas-well h-40 overflow-hidden">
        {scene ? <ScenePreview scene={scene} /> : null}
      </div>
      <div className="flex items-center gap-1.5 border-t px-2.5 py-1.5">
        <span className="truncate text-xs">{def.name}</span>
        {customized && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-primary"
            title="Customized for this brand"
          />
        )}
        <div className="flex-1" />
        <ComponentOverridePopover
          def={def}
          override={override}
          onChange={(next) => onOverride(def.id, next)}
        />
      </div>
    </div>
  )
}
