// Shape & depth controls with inline "what does this do" previews: radius and
// spacing become sliders whose mini samples update live while you drag, and
// shadow becomes a visual preset grid (ShadowPicker). Non-px token values
// (rare — calc()/em) fall back to a raw text input instead of the slider.

import { Input } from "@/components/ui/input"
import { BrandSlider, RowShell } from "./controls"
import { ShadowPicker } from "./ShadowPicker"
import { useBrandEditorUi } from "./brand-editor-ui"

/** Strict "<number>px" (or bare-number) parse; anything else → raw input. */
function pxValue(v: string | undefined): number | null {
  if (!v) return null
  const m = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(v.trim())
  return m ? parseFloat(m[1]) : null
}

function RawFallback({
  label,
  token,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  token: string
  value: string
  placeholder: string
  onCommit: (v: string) => void
}) {
  const { pingToken } = useBrandEditorUi()
  return (
    <RowShell label={label} token={token}>
      <Input
        key={value}
        defaultValue={value}
        placeholder={placeholder}
        className="h-7 flex-1 font-mono text-[11px]"
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && v !== value) {
            onCommit(v)
            pingToken(token)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </RowShell>
  )
}

export function ShapeSection({
  tokens,
  onLiveToken,
  onCommitToken,
}: {
  tokens: Record<string, string>
  /** In-memory only — previews restyle, nothing persists. */
  onLiveToken: (key: string, value: string) => void
  /** Persist + ping the gallery. */
  onCommitToken: (key: string, value: string) => void
}) {
  const { pingToken } = useBrandEditorUi()
  const radius = pxValue(tokens["--radius"])
  const space = pxValue(tokens["--space"])

  const commitPx = (key: string, v: number) => {
    onCommitToken(key, `${Math.round(v)}px`)
    pingToken(key)
  }

  return (
    <div className="space-y-4">
      {radius === null ? (
        <RawFallback
          label="Radius"
          token="--radius"
          value={tokens["--radius"] ?? ""}
          placeholder="18px"
          onCommit={(v) => onCommitToken("--radius", v)}
        />
      ) : (
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <BrandSlider
              label="Radius"
              token="--radius"
              min={0}
              max={48}
              step={1}
              unit="px"
              value={radius}
              onLive={(v) => onLiveToken("--radius", `${Math.round(v)}px`)}
              onCommit={(v) => commitPx("--radius", v)}
            />
          </div>
          {/* Live sample in the brand's own primary (the rail sits in the
              app-shell theme, so brand tokens are applied as values). */}
          <span
            className="mb-0.5 block h-8 w-11 shrink-0 border-2"
            style={{
              borderRadius: tokens["--radius"],
              borderColor: tokens["--primary"],
              background: `color-mix(in srgb, ${tokens["--primary"] ?? "currentColor"} 25%, transparent)`,
            }}
          />
        </div>
      )}

      {space === null ? (
        <RawFallback
          label="Spacing unit"
          token="--space"
          value={tokens["--space"] ?? ""}
          placeholder="16px"
          onCommit={(v) => onCommitToken("--space", v)}
        />
      ) : (
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <BrandSlider
              label="Spacing unit"
              token="--space"
              min={4}
              max={40}
              step={1}
              unit="px"
              value={space}
              onLive={(v) => onLiveToken("--space", `${Math.round(v)}px`)}
              onCommit={(v) => commitPx("--space", v)}
            />
          </div>
          <span
            className="mb-0.5 flex h-8 w-11 shrink-0 items-center justify-center rounded border border-border"
            style={{ gap: `calc(${tokens["--space"]} / 4)` }}
          >
            <span className="h-4 w-1 rounded-full bg-muted-foreground/70" />
            <span className="h-4 w-1 rounded-full bg-muted-foreground/70" />
            <span className="h-4 w-1 rounded-full bg-muted-foreground/70" />
          </span>
        </div>
      )}

      <ShadowPicker
        value={tokens["--shadow"] ?? ""}
        primary={tokens["--primary"] ?? "#ffffff"}
        onCommit={(v) => onCommitToken("--shadow", v)}
      />
    </div>
  )
}
