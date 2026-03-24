import { interaction } from "~/lib/motif"
import { useMotifState } from "~/hooks/useMotif"
import type { Tool } from "~/lib/motif/types"

const TOOLS: Array<{ id: Tool; icon: string; label: string; shortcut: string }> = [
  { id: "select", icon: "⊹", label: "Select", shortcut: "V" },
  { id: "hand", icon: "✋", label: "Hand", shortcut: "H" },
]

const SHAPE_TOOLS: Array<{ id: Tool; icon: string; label: string; shortcut: string }> = [
  { id: "text", icon: "T", label: "Text", shortcut: "T" },
  { id: "rect", icon: "▭", label: "Rectangle", shortcut: "R" },
  { id: "circle", icon: "○", label: "Circle", shortcut: "" },
  { id: "image", icon: "🖼", label: "Image", shortcut: "" },
  { id: "html", icon: "</>", label: "HTML", shortcut: "" },
]

const LAYOUT_TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: "flex", icon: "⊞", label: "Flex Container" },
  { id: "grid", icon: "▦", label: "Grid Container" },
]

export function ToolRail() {
  const { tool } = useMotifState()

  const renderBtn = (t: { id: Tool; icon: string; label: string; shortcut?: string }) => (
    <button
      key={t.id}
      className={`m-tool-btn ${tool === t.id ? "active" : ""}`}
      onClick={() => interaction.setTool(t.id)}
      title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ""}`}
    >
      <span className="m-tool-icon">{t.icon}</span>
    </button>
  )

  return (
    <div className="m-toolrail">
      {TOOLS.map(renderBtn)}
      <div className="m-toolrail-sep" />
      {SHAPE_TOOLS.map(renderBtn)}
      <div className="m-toolrail-sep" />
      {LAYOUT_TOOLS.map(renderBtn)}
    </div>
  )
}
