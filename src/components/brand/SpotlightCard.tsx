// The gallery's pinned hero: one composite scene built from catalog
// components that together consume nearly every theme token, so any inspector
// edit is visible above the fold without hunting through the grid. Rendered
// through the same ScenePreview tokens path as the tiles (live restyle, no
// rebuild) and participating in highlight/ping via its members' tokensUsed.

import { useMemo } from "react"
import type { Brand } from "@/brand/types"
import type { Scene } from "@/scene/types"
import { get, instantiate } from "@/brand/components"
import { emptyScene } from "@/scene/model"
import { ScenePreview } from "@/components/ScenePreview"
import { cn } from "@/lib/utils"
import { useTokenHighlight } from "./brand-editor-ui"

interface Member {
  id: string
  layout: {
    mode: "absolute"
    anchor:
      | "top-left"
      | "top-right"
      | "center-right"
      | "bottom-left"
      | "bottom-right"
    dx: number
    dy: number
    width: number | "auto"
    height: number | "auto"
  }
  /** Surface css patch — components ship editor-scale sizes (96px headline,
   *  460px card); the hero needs them scaled to compose within 1200×560. */
  css?: Record<string, string>
}

/** Composition tuned for a 1200×560 stage: copy block left, product card
 *  right, badge and logo in the corners, aurora wash behind everything. */
const MEMBERS: Member[] = [
  {
    id: "bg-aurora",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0,
      dy: 0,
      width: 1,
      height: 1,
    },
  },
  {
    id: "eyebrow",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0.06,
      dy: 0.09,
      width: "auto",
      height: "auto",
    },
  },
  {
    id: "headline",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0.06,
      dy: 0.17,
      width: 0.48,
      height: "auto",
    },
    css: { fontSize: "58px" },
  },
  {
    id: "subhead",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0.06,
      dy: 0.34,
      width: 0.4,
      height: "auto",
    },
    css: { fontSize: "26px" },
  },
  {
    id: "cta",
    layout: {
      mode: "absolute",
      anchor: "top-left",
      dx: 0.06,
      dy: 0.54,
      width: "auto",
      height: "auto",
    },
  },
  {
    id: "card-product",
    layout: {
      mode: "absolute",
      anchor: "center-right",
      dx: -0.04,
      dy: 0,
      width: "auto",
      height: "auto",
    },
    // Fixed-height internals (360px photo) — zoom the whole card to fit.
    css: { zoom: "0.72" },
  },
  {
    id: "badge-sticker",
    layout: {
      mode: "absolute",
      anchor: "top-right",
      dx: -0.26,
      dy: 0.05,
      width: "auto",
      height: "auto",
    },
  },
  {
    id: "logo-lockup",
    layout: {
      mode: "absolute",
      anchor: "bottom-left",
      dx: 0.06,
      dy: -0.05,
      width: "auto",
      height: "auto",
    },
    // zoom, not transform — compileLayout owns transform for anchoring.
    css: { zoom: "0.6" },
  },
]

function spotlightScene(brand: Brand): Scene {
  const scene = emptyScene(1200, 560)
  scene.theme = {
    mode: brand.theme.mode,
    tokens: { ...scene.theme.tokens, ...brand.theme.tokens },
  }
  const children = scene.root.children ?? (scene.root.children = [])
  for (const m of MEMBERS) {
    const built = instantiate(m.id, {
      layout: m.layout,
      css: m.css,
      logo: brand.logo,
      override: brand.components[m.id],
    })
    if (built) children.push(built.node)
  }
  return scene
}

export function SpotlightCard({ brand }: { brand: Brand }) {
  // Union of the members' declared tokens — the hero reacts to (almost) all.
  const tokensUsed = useMemo(
    () => [...new Set(MEMBERS.flatMap((m) => get(m.id)?.tokensUsed ?? []))],
    []
  )
  const { highlighted, dimmed, pingN } = useTokenHighlight(tokensUsed)

  // Structural rebuild only on member overrides / logo / mode; token values
  // stream through ScenePreview's live path.
  const scene = useMemo(
    () => spotlightScene(brand),
    [
      brand.logo,
      brand.theme.mode,
      ...MEMBERS.map((m) => brand.components[m.id]),
    ]
  )

  return (
    <div
      className={cn(
        "relative mb-8 overflow-hidden rounded-xl border transition-[opacity,box-shadow,border-color] duration-200",
        highlighted && "border-primary/60 ring-1 ring-primary/50",
        dimmed && "opacity-40 saturate-50"
      )}
    >
      <div className="canvas-well aspect-[1200/560] w-full">
        <ScenePreview scene={scene} tokens={brand.theme.tokens} />
      </div>
      {pingN !== null && <span key={pingN} className="brand-ping" />}
      <span className="absolute top-2.5 left-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] tracking-wider text-white/80 uppercase backdrop-blur">
        Spotlight
      </span>
    </div>
  )
}
