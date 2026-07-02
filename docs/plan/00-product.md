# 00 — Product Decisions

Motif is an **agent-first editor for social-media marketing visuals**: static post images and
short animated videos for campaigns. You chat with Claude; Claude builds the design. Every
generation produces editable HTML/CSS (never a flat raster), so each element stays draggable,
restyleable, and re-promptable after it's created.

This document fixes the product scope and what "agent-first" means concretely. It is the triage
filter for every future feature request.

## 1. Target user & jobs

**Primary user:** the solo marketer / social-media manager at a small brand or agency who ships
10–50 campaign visuals a week across formats, has taste but not design-tool fluency, and today
alternates between Canva templates and waiting on a designer.

Jobs to be done, in priority order:

1. **Brief → campaign.** "Turn this campaign brief into on-brand visuals for every channel in one
   sitting." (multi-format generation)
2. **Iterate without regenerating.** "Change the headline / swap the product photo / make it feel
   more premium." (chat iteration + direct manipulation)
3. **Make it move.** A 3–8s animated version for Stories/Reels/ads with tasteful motion, exported
   as mp4. (animation presets + video export)
4. **Stay on brand.** Logo, palette, fonts applied automatically. (brand kit)

## 2. Core flows

- **Brief → campaign.** User types/pastes a brief ("Spring sale, 30% off, outdoor gear, energetic
  but premium"), optionally drops a product photo and picks target formats. The agent generates one
  canonical scene, narrates its choices, then derives per-format variants. The canvas fills in
  progressively as the tool input streams — generation is watchable, not a spinner.
- **Chat-driven iteration.** Every request ("bigger price badge", "try a retro film look",
  "animate the headline in word by word") maps to controller commands. The agent explains what it
  did in one or two sentences; each turn lands as a single undoable step.
- **Direct manipulation as a peer.** Click/drag/resize any element; the properties panels issue the
  *same* commands through the *same* normalize gate the agent uses. Selection is shared context:
  the agent's next turn sees "user has `headline` selected" and "user manually moved `badge`" in
  its world model.
- **Brand kit** (project-level): logo asset, OKLCH palette mapped to design tokens, two font
  families, tone-of-voice notes. Compiled into `theme.tokens` and injected into the agent's system
  prompt. "Apply brand" is one command.
- **Looks & templates.** Curated looks = bundles of theme tokens + effect layers + anim presets
  (`owner`-tagged so they're swappable in one step). Templates = starter scenes per use case
  (sale, launch, event, quote, testimonial).
- **Export.** Static: PNG/JPEG at exact format pixels, batch "export all formats". Motion: mp4
  (H.264) primary, WebM fallback, ≤15s duration, 30fps, with a progress UI.

Supported formats: Instagram post (1080×1080), Instagram story (1080×1920), Facebook cover,
X header, OG link preview (1200×630), Pinterest pin, YouTube thumbnail.

## 3. Scope guardrails — what Motif deliberately does NOT do

- **No raster editing.** No brush, heal, mask-painting, background removal. Images are placed
  assets styled with CSS/GLSL. (An external bg-removal API could integrate later; not core.)
- **No general video editing.** No clip timeline, no imported footage, no audio, no multi-shot
  transitions. One scene, one duration, engine-driven property animation.
- **No freeform vector illustration.** Shapes are HTML/CSS boxes; anything fancier is an effect
  or an asset.
- **No multiplayer / cloud accounts** in this remake. Local-first; server sync is a later layer
  behind the persistence interface.
- **Not a website builder.** HTML/CSS is the *medium*, not the product; the output is pixels.

## 4. What "agent-first" means concretely

1. **Chat is the primary panel** — open by default, sized as a first-class left rail, built from
   the shadcn chat primitives already in this scaffold (`message`, `bubble`, `attachment`,
   `message-scroller`).
2. **One command surface, two clients.** The headless controller (`dispatch`/`describe`) is the
   only way anything mutates the document. Agent tool calls and UI widgets are indistinguishable
   at that seam.
3. **Every agent edit is an undoable transaction.** One tool call (a command batch) = one history
   entry = one "Applied N edits · Undo" chip in the chat transcript.
4. **The agent narrates.** Short interleaved text between tool calls ("Setting a warmer palette,
   then animating the badge"). The system prompt caps narration at one sentence per action.
5. **The human can take over any element at any time.** The agent observes those edits via the
   diff-annotated world model on its next turn ("user changed: headline.css.fontSize") and must
   not silently revert them.
6. **Failure is conversational.** Normalize-gate repairs are reported in tool results ("clamped
   intensity 4.2 → 1.0"); hard failures (e.g. a GLSL compile error) return the compiler log so
   the agent self-corrects in the same turn.

## 5. Relationship to v1

The v1 build (SvelteKit, `../../src/lib/` in the parent repo) proved the concept: the scene
document, the command seam, the effect registry, and the HTML-in-Canvas render pipeline all work.
What v1 never had: an actual connected agent, animation that paints, video export, undo, or
persistence. The remake exists to deliver those on a stronger architecture — see
[01-architecture.md](01-architecture.md).
