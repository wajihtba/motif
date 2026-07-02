// Keyless dev mode — a recorded agent turn replayed as real SSE events.
// When ANTHROPIC_API_KEY is absent the /api/agent route streams this script
// instead of calling the API, so the whole chat → tools → progressive-canvas
// path is demoable and testable end-to-end. The event shapes match the
// Messages API streaming format exactly; the client cannot tell the difference.

interface MockEvent {
  type: string
  [k: string]: unknown
}

const DEMO_SCENE = {
  background:
    "radial-gradient(120% 100% at 80% 0%, #2b1c12 0%, #120b06 55%, #0a0603 100%)",
  theme: {
    tokens: {
      "--primary": "oklch(0.75 0.14 75)",
      "--primary-foreground": "#1c1206",
      "--accent": "oklch(0.62 0.12 50)",
      "--ink": "#f7efe4",
      "--muted": "oklch(0.66 0.03 75)",
      "--font-heading": "'Playfair Display', Georgia, serif",
      "--font-body": "'Plus Jakarta Sans', system-ui, sans-serif",
    },
  },
  root: {
    id: "root",
    role: "group",
    children: [
      {
        id: "glow",
        role: "scrim",
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: -0.12,
          width: 0.9,
          height: 0.5,
        },
        css: {
          background:
            "radial-gradient(closest-side, rgba(255,190,110,0.28), transparent 70%)",
          filter: "blur(2px)",
        },
      },
      {
        id: "eyebrow",
        role: "eyebrow",
        html: "MORNING RITUAL CO.",
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: 0.09,
          width: "auto",
          height: "auto",
        },
        css: {
          fontFamily: "var(--font-body)",
          fontSize: "26px",
          letterSpacing: "0.42em",
          color: "var(--primary)",
          fontWeight: "600",
        },
      },
      {
        id: "headline",
        role: "headline",
        html: "Slow<br><em>Roast</em> Sunday",
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: 0.16,
          width: "auto",
          height: "auto",
        },
        css: {
          fontFamily: "var(--font-heading)",
          fontSize: "128px",
          lineHeight: "1.02",
          textAlign: "center",
          color: "var(--ink)",
          letterSpacing: "-0.02em",
        },
      },
      {
        id: "subhead",
        role: "subhead",
        html: "Single-origin pour-overs, half price until noon.",
        layout: {
          mode: "absolute",
          anchor: "top-center",
          dx: 0,
          dy: 0.47,
          width: "auto",
          height: "auto",
        },
        css: {
          fontFamily: "var(--font-body)",
          fontSize: "32px",
          color: "var(--muted)",
        },
      },
      {
        id: "card",
        role: "group",
        layout: {
          mode: "stack",
          direction: "column",
          gap: 10,
          align: "center",
          justify: "center",
          anchor: "center",
          dx: 0,
          dy: 0.13,
          width: 0.42,
          height: 0.22,
        },
        css: {
          background: "rgba(255,245,230,0.06)",
          border: "1px solid rgba(255,220,170,0.25)",
          borderRadius: "24px",
          backdropFilter: "blur(6px)",
        },
        children: [
          {
            id: "price",
            role: "price",
            html: "−50%",
            layout: { mode: "flow" },
            css: {
              fontFamily: "var(--font-heading)",
              fontSize: "84px",
              color: "var(--primary)",
            },
          },
          {
            id: "meta",
            role: "meta",
            html: "every sunday · 8–12am",
            layout: { mode: "flow" },
            css: {
              fontFamily: "var(--font-body)",
              fontSize: "22px",
              letterSpacing: "0.2em",
              color: "var(--muted)",
              textTransform: "uppercase",
            },
          },
        ],
      },
      {
        id: "cta",
        role: "cta",
        html: "Reserve a seat",
        layout: {
          mode: "absolute",
          anchor: "bottom-center",
          dx: 0,
          dy: -0.08,
          width: "auto",
          height: "auto",
        },
        css: {
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          fontFamily: "var(--font-body)",
          fontWeight: "700",
          fontSize: "30px",
          padding: "20px 52px",
          borderRadius: "999px",
        },
      },
    ],
  },
}

function textTurn(text: string, stop: "end_turn" | "tool_use"): MockEvent[] {
  const words = text.split(/(?<= )/)
  return [
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    ...words.map((w) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: w },
    })),
    { type: "content_block_stop", index: 0 },
    ...(stop === "end_turn"
      ? [
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: words.length },
          },
          { type: "message_stop" },
        ]
      : []),
  ]
}

/** Build the mock event script for one request. `followUp` = the client is
 *  returning tool results (second round of the turn). */
export function mockEvents(followUp: boolean): MockEvent[] {
  const start: MockEvent = {
    type: "message_start",
    message: {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: "mock",
      content: [],
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    },
  }
  if (followUp) {
    return [
      start,
      ...textTurn(
        "Warm café palette with an oversized serif headline and a glass offer card — tell me what to push further.",
        "end_turn"
      ),
    ]
  }

  const json = JSON.stringify(DEMO_SCENE)
  const chunks: string[] = []
  for (let i = 0; i < json.length; i += 48) chunks.push(json.slice(i, i + 48))
  return [
    start,
    ...textTurn(
      "Building a Sunday coffee promo — dark roast tones, big serif headline. ",
      "tool_use"
    ),
    {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "toolu_mock_generate",
        name: "motif_generate",
        input: {},
      },
    },
    ...chunks.map((partial_json) => ({
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json },
    })),
    { type: "content_block_stop", index: 1 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: 400 },
    },
    { type: "message_stop" },
  ]
}
