// Sanitizers — the load-bearing half of the normalize gate
// (docs/plan/03-agent-first.md §5). Agent-authored HTML/CSS is an injection
// surface: the scene DOM is real DOM. Rules:
//
//   HTML  allowlisted tags only; script/iframe/on* stripped; <img> only with
//         asset:/data: sources (remote photos belong on node.image, which the
//         engine loads CORS-clean with fallbacks).
//   CSS   no position:fixed (escapes the canvas box model), no url() except
//         asset:/data: (exfiltration + taint vector), no @import.
//
// Every removal is reported as a warning so the agent can self-correct in the
// same turn instead of silently losing work.

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
])

const SAFE_IMG_SRC = /^(asset:|data:image\/)/i
const SAFE_CSS_URL = /url\(\s*['"]?(asset:|data:image\/)/i

export interface SanitizeResult<T> {
  value: T
  warnings: string[]
}

/** Sanitize a fragment of node inner HTML. */
export function sanitizeHtml(html: string): SanitizeResult<string> {
  const warnings: string[] = []
  if (!html) return { value: "", warnings }
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html"
  )
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) {
        warnings.push(`removed <${tag}> (not allowed in node html)`)
        // Keep the text content so copy is never silently lost.
        child.replaceWith(doc.createTextNode(child.textContent))
        continue
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase()
        if (name.startsWith("on")) {
          warnings.push(`removed ${name} handler on <${tag}>`)
          child.removeAttribute(attr.name)
        } else if (name === "src" && tag === "img") {
          if (!SAFE_IMG_SRC.test(attr.value)) {
            warnings.push(
              `removed img src "${attr.value.slice(0, 40)}" — use asset: URLs (or node.image for photos)`
            )
            child.removeAttribute(attr.name)
          }
        } else if (name === "href") {
          warnings.push(`removed href on <${tag}> (links don't paint)`)
          child.removeAttribute(attr.name)
        } else if (name === "style") {
          const { value, warnings: w } = sanitizeCssText(attr.value)
          warnings.push(...w)
          if (value) child.setAttribute("style", value)
          else child.removeAttribute("style")
        }
      }
      walk(child)
    }
  }
  walk(doc.body)
  return { value: doc.body.innerHTML, warnings }
}

/** Sanitize a css declaration map (camelCase keys → values). */
export function sanitizeCss(
  css: Record<string, string>
): SanitizeResult<Record<string, string>> {
  const warnings: string[] = []
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(css)) {
    const value = String(raw)
    if (key === "position" && value === "fixed") {
      warnings.push("dropped position:fixed (not allowed inside the scene)")
      continue
    }
    if (/url\(/i.test(value) && !SAFE_CSS_URL.test(value)) {
      warnings.push(`dropped ${key} — url() must use asset:/data: sources`)
      continue
    }
    if (/@import|expression\s*\(/i.test(value)) {
      warnings.push(`dropped ${key} (disallowed construct)`)
      continue
    }
    out[key] = value
  }
  return { value: out, warnings }
}

/** Sanitize inline style text (style="…" inside node html). */
function sanitizeCssText(text: string): SanitizeResult<string> {
  const warnings: string[] = []
  const decls = text
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
  const kept: string[] = []
  for (const d of decls) {
    const [prop = "", ...rest] = d.split(":")
    const value = rest.join(":").trim()
    const key = prop.trim().toLowerCase()
    if (key === "position" && value === "fixed") {
      warnings.push("dropped inline position:fixed")
      continue
    }
    if (/url\(/i.test(value) && !SAFE_CSS_URL.test(value)) {
      warnings.push(`dropped inline ${key} — url() must use asset:/data:`)
      continue
    }
    kept.push(`${key}: ${value}`)
  }
  return { value: kept.join("; "), warnings }
}

/** Sanitize the shared scene stylesheet. */
export function sanitizeStylesheet(css: string): SanitizeResult<string> {
  const warnings: string[] = []
  let out = css
  if (/@import/i.test(out)) {
    warnings.push("removed @import from stylesheet")
    out = out.replace(/@import[^;]+;/gi, "")
  }
  out = out.replace(/url\(\s*['"]?(?!asset:|data:image\/)[^)]*\)/gi, () => {
    warnings.push("removed non-asset url() from stylesheet")
    return "none"
  })
  return { value: out, warnings }
}

/** Sanitize a node.image source: asset:/data: always fine; https allowed
 *  (the engine loads it CORS-clean with an error fallback). */
export function sanitizeImageSrc(src: string): SanitizeResult<string | null> {
  if (SAFE_IMG_SRC.test(src) || /^https:\/\//i.test(src)) {
    return { value: src, warnings: [] }
  }
  return {
    value: null,
    warnings: [`dropped image "${src.slice(0, 40)}" — https/asset:/data: only`],
  }
}
