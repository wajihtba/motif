// The brand kit dialog: palette tokens, two fonts, tone of voice, and a
// logo that lands in the IndexedDB asset store (asset: URL — same-origin,
// taint-free). Everything dispatches brand.apply, the same command the
// agent uses; the kit rides the agent's per-turn context.

import { useRef, useState } from "react"
import type { EditorController } from "@/controller"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { primeAssets, putAsset } from "@/persistence/assets"
import { useEditorState } from "@/hooks/use-document-store"

const PALETTE_KEYS = [
  { key: "--primary", label: "Primary" },
  { key: "--accent", label: "Accent" },
  { key: "--ink", label: "Ink (text on art)" },
  { key: "--background", label: "Background" },
] as const

export function BrandKitDialog({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const kit = state.document.brandKit
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const apply = (args: Record<string, unknown>) =>
    ctrl.dispatch({ command: "brand.apply", args }, { label: "Brand kit" })

  const uploadLogo = async (file: File) => {
    const assetUrl = await putAsset(file, "brand-logo")
    await primeAssets()
    apply({ logo: assetUrl })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          Brand
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Brand kit</DialogTitle>
          <DialogDescription className="text-xs">
            Compiled into the theme tokens and handed to the agent on every turn
            — it designs on-brand without being asked.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {PALETTE_KEYS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-[11px]">{label}</Label>
              <Input
                defaultValue={kit?.palette[key] ?? ""}
                placeholder="oklch(0.7 0.15 60) / #hex"
                className="h-8 text-xs"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== kit?.palette[key]) {
                    apply({ palette: { [key]: v } })
                  }
                }}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[11px]">Heading font</Label>
            <Input
              defaultValue={kit?.fontHeading ?? ""}
              placeholder="'Playfair Display', serif"
              className="h-8 text-xs"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== kit?.fontHeading) apply({ fontHeading: v })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Body font</Label>
            <Input
              defaultValue={kit?.fontBody ?? ""}
              placeholder="'Plus Jakarta Sans', sans-serif"
              className="h-8 text-xs"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== kit?.fontBody) apply({ fontBody: v })
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Tone of voice</Label>
          <Textarea
            defaultValue={kit?.voice ?? ""}
            placeholder="Confident, warm, no exclamation marks…"
            className="min-h-16 text-xs"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (kit?.voice ?? "")) apply({ voice: v })
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            {kit?.logo ? "Replace logo" : "Upload logo"}
          </Button>
          {kit?.logo && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {kit.logo}
            </span>
          )}
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

        <DialogFooter>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
