// Starter document — what a fresh editor shows before the agent generates
// anything (M2 replaces this moment with chat-driven generation; the starter
// keeps every editor surface exercisable meanwhile).

import type { Document, Scene } from "../scene/types"
import { emptyDocument, emptyScene, node, rootNode } from "../scene/model"

export function starterScene(): Scene {
  const scene = emptyScene(1080, 1080, "ig-post")
  scene.background =
    "radial-gradient(120% 90% at 20% 10%, #1d1440 0%, #0a0a0f 60%)"
  scene.root = rootNode([
    node({
      id: "hero",
      role: "image",
      layout: {
        mode: "absolute",
        anchor: "center",
        dx: 0,
        dy: 0.04,
        width: 0.62,
        height: 0.46,
      },
      css: {
        background:
          "linear-gradient(135deg, oklch(0.67 0.18 281) 0%, oklch(0.62 0.2 350) 100%)",
        borderRadius: "28px",
        boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
      },
    }),
    node({
      id: "headline",
      role: "headline",
      html: "Spring <em>Sale</em>",
      editable: true,
      layout: {
        mode: "absolute",
        anchor: "top-center",
        dx: 0,
        dy: 0.1,
        width: "auto",
        height: "auto",
      },
      css: {
        fontFamily: "var(--font-heading)",
        fontSize: "104px",
        fontWeight: "700",
        color: "var(--ink)",
        whiteSpace: "nowrap",
        letterSpacing: "-0.02em",
      },
    }),
    node({
      id: "subhead",
      role: "subhead",
      html: "Up to 30% off everything, this weekend only.",
      editable: true,
      layout: {
        mode: "absolute",
        anchor: "top-center",
        dx: 0,
        dy: 0.225,
        width: "auto",
        height: "auto",
      },
      css: {
        fontFamily: "var(--font-body)",
        fontSize: "34px",
        color: "var(--muted)",
        whiteSpace: "nowrap",
      },
    }),
    node({
      id: "badge",
      role: "badge",
      html: "−30%",
      layout: {
        mode: "absolute",
        anchor: "top-right",
        dx: -0.06,
        dy: 0.06,
        width: 0.16,
        height: 0.16,
      },
      css: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--accent)",
        color: "#1a1206",
        fontFamily: "var(--font-body)",
        fontWeight: "800",
        fontSize: "44px",
        borderRadius: "50%",
        boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
      },
    }),
    node({
      id: "cta",
      role: "cta",
      html: "Shop now",
      editable: true,
      layout: {
        mode: "absolute",
        anchor: "bottom-center",
        dx: 0,
        dy: -0.09,
        width: "auto",
        height: "auto",
      },
      css: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        fontFamily: "var(--font-body)",
        fontWeight: "700",
        fontSize: "34px",
        padding: "22px 56px",
        borderRadius: "999px",
      },
    }),
  ])
  return scene
}

export function starterDocument(name = "Untitled"): Document {
  const doc = emptyDocument(name)
  doc.scene = starterScene()
  return doc
}
