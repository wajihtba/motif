// The vision-review round (design guard, off by default): after the
// deterministic checks are clean — or their one repair round is spent — the
// settled render goes back to the model as an image with a critique brief,
// once per send. In-band by design: the same conversation, the same tools,
// so "fix it" is just another motif_edit that re-enters the lint pipeline
// (and judgeAttempted keeps a second review from ever triggering).
//
// The criteria are the SUBJECTIVE complement of the deterministic rules:
// geometry, spacing and contrast are already guaranteed by math before this
// runs, so the brief spends its attention on what only eyes can judge.
// A stricter out-of-band judge (own route, own system prompt, JSON verdict)
// can replace buildJudgeMessage behind this same seam later.

import type { GuardConfig } from "../controller/guard/types"

export function judgeCriteria(config: GuardConfig): string[] {
  return [
    "hierarchy: one clear focal point — the eye should land on the headline first, then flow naturally",
    "balance: no lopsided empty regions or visual weight dumped in one corner unless clearly intentional",
    "crowding: text blocks and groups keep breathing room; nothing feels crammed",
    "typography: sizes step meaningfully (headline ≫ subhead ≫ meta) and line lengths stay readable",
    "color: accents belong to the palette; no accidental clashes or muddy combinations",
    "polish: would a designer ship this exact frame?",
    ...(config.visionJudge.extraCriteria ?? []),
  ]
}

/** One synthetic user message: the downscaled render + the critique brief. */
export function buildJudgeMessage(
  jpegBase64: string,
  criteria: string[]
): Array<Record<string, unknown>> {
  return [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: jpegBase64,
      },
    },
    {
      type: "text",
      text:
        `(automatic design review) This is the current render. Critique it against:\n` +
        criteria.map((c) => `- ${c}`).join("\n") +
        `\nIf you find real problems, fix them now with motif_edit. If it holds up, say the design passes and end your turn — do not change anything for the sake of changing it.`,
    },
  ]
}
