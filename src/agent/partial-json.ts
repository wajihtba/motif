// Tolerant partial-JSON parsing for eager tool-input streaming
// (docs/plan/01-architecture.md §6): as motif_generate's input streams in,
// each prefix is repaired into the best complete value so closed scene nodes
// can be applied to the live document immediately — the "watchable
// generation" moment. Never throws; returns undefined only when no value can
// be recovered.

/** Parse a (possibly truncated) JSON document prefix. */
export function parsePartialJson(src: string): unknown {
  const text = src.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    /* fall through to repair */
  }

  // Walk once, tracking string state and the open-container stack.
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{" || ch === "[") stack.push(ch)
    else if (ch === "}" || ch === "]") stack.pop()
  }

  // Try progressively harder repairs on progressively shorter prefixes.
  let candidate = text
  if (escaped) candidate = candidate.slice(0, -1) // dangling backslash
  for (let attempt = 0; attempt < 40; attempt++) {
    const repaired = close(candidate, inString && attempt === 0, stack)
    try {
      return JSON.parse(repaired)
    } catch {
      // Trim back to the previous structural boundary and drop any dangling
      // partial token (`"a": tru`, `12.`, `"key":`) before retrying.
      const cut = lastBoundary(candidate)
      if (cut <= 0) return undefined
      candidate = candidate.slice(0, cut)
      // Recompute open-container stack for the shorter prefix.
      stack.length = 0
      inString = false
      escaped = false
      for (const ch of candidate) {
        if (inString) {
          if (escaped) escaped = false
          else if (ch === "\\") escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === "{" || ch === "[") stack.push(ch)
        else if (ch === "}" || ch === "]") stack.pop()
      }
    }
  }
  return undefined
}

/** Close an (optionally mid-string) prefix with the right terminators. */
function close(prefix: string, openString: boolean, stack: string[]): string {
  let out = prefix
  if (openString) out += '"'
  // Strip a trailing comma / colon that would make the close invalid.
  out = out.replace(/[,:\s]+$/, "")
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === "{" ? "}" : "]"
  }
  return out
}

/** Index just after the last comma or opening bracket outside a string —
 *  the safe place to cut a dangling partial token. */
function lastBoundary(text: string): number {
  let inString = false
  let escaped = false
  let cut = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "," || ch === "{" || ch === "[") cut = i
  }
  // Cut BEFORE the comma (drop it); AFTER an opening bracket (keep it).
  if (cut === -1) return -1
  return text[cut] === "," ? cut : cut + 1
}
