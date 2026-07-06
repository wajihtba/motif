// Curated typeface choices for the brand Type tokens + on-demand Google Fonts
// loading. The scene engine already re-measures when the document font set
// settles (engine listens on document.fonts.ready), so a head-injected
// stylesheet is all it takes for previews and the canvas to pick a family up.
// Every stack keeps real fallbacks, so offline degrades to today's behavior.

export interface FontChoice {
  label: string
  /** The full font-family stack written into the token. */
  stack: string
  category: "serif" | "sans" | "display" | "mono"
  /** css2 `family=` query (name + axes); absent = locally available. */
  googleQuery?: string
}

export const FONT_CHOICES: FontChoice[] = [
  {
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, serif",
    category: "serif",
    googleQuery: "Playfair+Display:wght@400..900",
  },
  {
    label: "DM Serif Display",
    stack: "'DM Serif Display', Georgia, serif",
    category: "serif",
    googleQuery: "DM+Serif+Display",
  },
  {
    label: "Lora",
    stack: "'Lora', Georgia, serif",
    category: "serif",
    googleQuery: "Lora:wght@400..700",
  },
  {
    label: "Plus Jakarta Sans",
    stack: "'Plus Jakarta Sans', system-ui, sans-serif",
    category: "sans",
    googleQuery: "Plus+Jakarta+Sans:wght@200..800",
  },
  {
    label: "Inter",
    stack: "'Inter', system-ui, sans-serif",
    category: "sans",
    googleQuery: "Inter:wght@100..900",
  },
  {
    label: "Space Grotesk",
    stack: "'Space Grotesk', system-ui, sans-serif",
    category: "sans",
    googleQuery: "Space+Grotesk:wght@300..700",
  },
  {
    label: "Montserrat",
    stack: "'Montserrat Variable', 'Montserrat', sans-serif",
    category: "sans", // ships with the app via fontsource
  },
  {
    label: "Bebas Neue",
    stack: "'Bebas Neue', 'Arial Narrow', sans-serif",
    category: "display",
    googleQuery: "Bebas+Neue",
  },
  {
    label: "Archivo Black",
    stack: "'Archivo Black', 'Arial Black', sans-serif",
    category: "display",
    googleQuery: "Archivo+Black",
  },
  {
    label: "IBM Plex Mono",
    stack: "'IBM Plex Mono', ui-monospace, monospace",
    category: "mono",
    googleQuery: "IBM+Plex+Mono:wght@400;700",
  },
  {
    label: "Georgia",
    stack: "Georgia, 'Times New Roman', serif",
    category: "serif",
  },
  {
    label: "System UI",
    stack: "system-ui, -apple-system, sans-serif",
    category: "sans",
  },
]

const loaded = new Set<string>()

/** Inject the Google Fonts stylesheet for one css2 family query, once. */
export function ensureFontLoaded(googleQuery: string): void {
  if (typeof document === "undefined" || loaded.has(googleQuery)) return
  loaded.add(googleQuery)
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?family=${googleQuery}&display=swap`
  document.head.appendChild(link)
}

/** First family in a font-family stack, unquoted. */
export function primaryFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "")
}

/** The curated choice a stack corresponds to (matched on primary family). */
export function fontChoiceFor(stack: string): FontChoice | undefined {
  const primary = primaryFamily(stack).toLowerCase()
  return FONT_CHOICES.find((c) => {
    const p = primaryFamily(c.stack).toLowerCase()
    // "Montserrat Variable" should match a plain "Montserrat" stack too.
    return p === primary || p.replace(/ variable$/, "") === primary
  })
}

/** Load the web font behind a stack, if we curate one for it. */
export function ensureStackLoaded(stack: string): void {
  const q = fontChoiceFor(stack)?.googleQuery
  if (q) ensureFontLoaded(q)
}
