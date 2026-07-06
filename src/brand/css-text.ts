// Tiny css-text <-> record converters for the override popover's raw-CSS
// escape hatch ("border-radius: 4px;" lines <-> camelCase records). The
// record still goes through sanitizeCss before touching any node.

const toCamel = (prop: string): string =>
  prop.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

const toKebab = (key: string): string =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** "text-transform: uppercase; gap: 4px" → { textTransform: "uppercase", … } */
export function parseCssText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of text.split(";")) {
    const i = decl.indexOf(":")
    if (i === -1) continue
    const prop = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (prop && value) out[toCamel(prop)] = value
  }
  return out
}

export function cssTextFromRecord(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([k, v]) => `${toKebab(k)}: ${v};`)
    .join("\n")
}
