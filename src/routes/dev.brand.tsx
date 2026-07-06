// /dev/brand — component-registry verify harness. Renders every registered
// brand component as a DOM tile (ScenePreview) across the theme presets, with
// a preset switcher and a per-component variant cycler. If a token edit
// doesn't restyle a tile here, the def hardcoded a value it should reference.

import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { ComponentDef } from "@/brand/components"
import type { Scene } from "@/scene/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScenePreview } from "@/components/ScenePreview"
import { defaultVariants, groups, instantiate } from "@/brand/components"
import { emptyScene } from "@/scene/model"
import { THEME_PRESETS } from "@/scene/theme"

export const Route = createFileRoute("/dev/brand")({ component: DevBrand })

/** A one-component scene at the def's preview size, themed by the preset. */
function tileScene(
  def: ComponentDef,
  presetName: string,
  variants: Record<string, string>
): Scene | null {
  const preset = THEME_PRESETS.find((p) => p.name === presetName)
  const { w, h } = def.preview ?? { w: 500, h: 300 }
  const scene = emptyScene(w, h)
  if (preset) scene.theme = structuredClone(preset.theme)
  const built = instantiate(def.id, { variants })
  if (!built) return null
  scene.root.children = [built.node]
  return scene
}

/** Advance every axis to its next option (cycles through combinations). */
function nextVariants(
  def: ComponentDef,
  current: Record<string, string>
): Record<string, string> {
  const out = { ...current }
  for (const axis of def.variants ?? []) {
    const i = axis.options.findIndex((o) => o.id === current[axis.key])
    out[axis.key] = axis.options[(i + 1) % axis.options.length].id
  }
  return out
}

function DevBrand() {
  const [preset, setPreset] = useState(THEME_PRESETS[0].name)
  const [variantsById, setVariantsById] = useState<
    Record<string, Record<string, string>>
  >({})

  const buckets = useMemo(() => groups(), [])

  return (
    <div className="min-h-screen overflow-auto bg-background p-8 text-foreground">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Brand component harness</h1>
        <div className="ml-auto flex gap-2">
          {THEME_PRESETS.map((p) => (
            <Button
              key={p.name}
              size="sm"
              variant={p.name === preset ? "default" : "outline"}
              onClick={() => setPreset(p.name)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {buckets.map((bucket) => (
        <section key={bucket.group} className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {bucket.group}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {bucket.items.map((def) => {
              const variants = {
                ...defaultVariants(def),
                ...variantsById[def.id],
              }
              const scene = tileScene(def, preset, variants)
              return (
                <div
                  key={def.id}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="h-44">
                    {scene ? (
                      <ScenePreview scene={scene} />
                    ) : (
                      <div className="p-4 text-xs text-destructive">
                        failed to instantiate
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-t border-border p-2">
                    <span className="text-xs font-medium">{def.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {def.id}
                    </Badge>
                    {def.variants?.length ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-[10px]"
                        onClick={() =>
                          setVariantsById((prev) => ({
                            ...prev,
                            [def.id]: nextVariants(def, variants),
                          }))
                        }
                      >
                        {Object.values(variants).join(" · ")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
