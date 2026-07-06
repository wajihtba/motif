// describe() v2 — the agent's world model as compact stable text lines,
// ~10× smaller than JSON (docs/plan/03-agent-first.md §4). Levels:
//
//   summary       one paragraph: size/format/counts/brief/selection
//   tree          one line per node: id role tag "text" box layout flags
//   node          full detail for one node (layout + css + html)
//   capabilities  the action surface: commands, roles, theme tokens
//     (effect + anim catalogs join this level as their registries land)

import type { Box } from "../engine/backend"
import type { EditorState } from "./types"
import type { SceneNode } from "../scene/types"
import { findNode, flatten } from "../scene/model"
import { TOKENS } from "../scene/theme"
import { allCommands } from "./types"

export type DescribeLevel = "summary" | "tree" | "node" | "capabilities"

export interface DescribeOptions {
  level: DescribeLevel
  /** Node id for level:'node'. */
  id?: string
  /** Live measured boxes (engine measure); omit for layout-only description. */
  measure?: (id: string) => Box | null
}

export function describe(state: EditorState, opts: DescribeOptions): string {
  switch (opts.level) {
    case "summary":
      return summary(state)
    case "tree":
      return tree(state, opts.measure)
    case "node":
      return nodeDetail(state, opts.id, opts.measure)
    case "capabilities":
      return capabilities(state)
  }
}

function summary(state: EditorState): string {
  const { scene } = state.document
  const nodes = flatten(scene.root)
  const brief = state.document.brief
  const briefLine = [
    brief.goal && `goal: ${brief.goal}`,
    brief.audience && `audience: ${brief.audience}`,
    brief.tone && `tone: ${brief.tone}`,
    brief.mustInclude?.length &&
      `must-include: ${brief.mustInclude.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ")
  return [
    `document "${state.document.name}"`,
    `scene ${scene.baseWidth}×${scene.baseHeight} ${scene.format} · ${nodes.length} nodes · ${scene.effects.length} effects · ${scene.animations.length} anims · timeline ${scene.timeline.duration}s`,
    `theme ${scene.theme.mode} · background ${scene.background}`,
    briefLine ? `brief: ${briefLine}` : "brief: (empty)",
    state.selection.length
      ? `selection: ${state.selection.join(", ")}`
      : "selection: none",
  ].join("\n")
}

function nodeLine(
  n: SceneNode,
  depth: number,
  measure?: (id: string) => Box | null
): string {
  const text = (n.html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48)
  const box = measure?.(n.id)
  const parts = [
    `${"  ".repeat(depth)}#${n.id}`,
    n.role && `role=${n.role}`,
    n.tag && n.tag !== "div" && `<${n.tag}>`,
    text && `"${text}"`,
    n.image && `img=${n.image.slice(0, 32)}`,
    box && `box=(${r(box.x)},${r(box.y)} ${r(box.w)}×${r(box.h)})`,
    layoutBrief(n),
    n.hidden && "[hidden]",
    n.locked && "[locked]",
    n.allowOverlap && "[overlap-ok]",
  ]
  return parts.filter(Boolean).join(" ")
}

function layoutBrief(n: SceneNode): string {
  const l = n.layout
  if (l.mode === "flow") return "flow"
  if (l.mode === "absolute") return `abs@${l.anchor}`
  return `stack-${l.direction}${l.anchor ? `@${l.anchor}` : ""}`
}

function tree(
  state: EditorState,
  measure?: (id: string) => Box | null
): string {
  const lines: string[] = []
  const visit = (n: SceneNode, depth: number) => {
    lines.push(nodeLine(n, depth, measure))
    for (const c of n.children ?? []) visit(c, depth + 1)
  }
  visit(state.document.scene.root, 0)
  return lines.join("\n")
}

function nodeDetail(
  state: EditorState,
  id: string | undefined,
  measure?: (id: string) => Box | null
): string {
  const target = id ?? state.selection[state.selection.length - 1]
  if (!target) return "no node id given and nothing selected"
  const scene = state.document.scene
  const n = target === "root" ? scene.root : findNode(scene, target)
  if (!n) return `unknown node "${target}"`
  const css = Object.entries(n.css)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n")
  return [
    nodeLine(n, 0, measure),
    `layout: ${JSON.stringify(n.layout)}`,
    css ? `css:\n${css}` : "css: (none)",
    n.html != null ? `html: ${n.html.slice(0, 400)}` : null,
    n.children?.length
      ? `children: ${n.children.map((c) => c.id).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function capabilities(state: EditorState): string {
  const roles = [
    ...new Set(
      flatten(state.document.scene.root)
        .map((n) => n.role)
        .filter(Boolean)
    ),
  ]
  const byGroup = new Map<string, string[]>()
  for (const c of allCommands()) {
    const arr = byGroup.get(c.group) ?? []
    arr.push(`  ${c.id} — ${c.description}`)
    byGroup.set(c.group, arr)
  }
  const commands = [...byGroup.entries()]
    .map(([group, lines]) => `${group}:\n${lines.join("\n")}`)
    .join("\n")
  return [
    `roles in scene: ${roles.join(", ") || "(none)"}`,
    `theme tokens: ${TOKENS.map((t) => t.key).join(", ")}`,
    `commands:\n${commands}`,
  ].join("\n")
}

const r = (n: number) => Math.round(n)
