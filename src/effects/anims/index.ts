// Animation catalogue — canvas-transform animations applied around an element's
// draw (the renderer centers the context on the element before calling apply,
// then draws at (-w/2, -h/2)).
//
// Built from legacy elementfx.ts (ANIMS[] + the applyAnim switch): each def
// co-locates its identity with the exact transform body of that switch case.
// The legacy signature was applyAnim(ctx, name, t, _w, h) — width was ignored as
// `_w`; the new signature is apply(ctx, t, w, h, p). Every case body is preserved
// byte-identical (most read only `t` and `h`; none read `w`). `none` had no
// switch case, so it stays a no-op (animated: false).

import type { AnimDef } from "../core/types"
import { registerAll } from "../core/registry"

const none: AnimDef = {
  kind: "anim",
  id: "none",
  name: "None",
  group: "Animation",
  animated: false,
  params: [],
  apply: (): void => {},
}

const float: AnimDef = {
  kind: "anim",
  id: "float",
  name: "Float",
  group: "Animation",
  animated: true,
  params: [],
  apply: (
    ctx: CanvasRenderingContext2D,
    t: number,
    _w: number,
    h: number
  ): void => {
    ctx.translate(0, Math.sin(t * 2) * h * 0.05)
  },
}

const pulse: AnimDef = {
  kind: "anim",
  id: "pulse",
  name: "Pulse",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    const s = 1 + Math.sin(t * 3) * 0.05
    ctx.scale(s, s)
  },
}

const spin: AnimDef = {
  kind: "anim",
  id: "spin",
  name: "Spin",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    ctx.rotate(t * 1.0)
  },
}

const wobble: AnimDef = {
  kind: "anim",
  id: "wobble",
  name: "Wobble",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    ctx.rotate(Math.sin(t * 3) * 0.12)
  },
}

const swing: AnimDef = {
  kind: "anim",
  id: "swing",
  name: "Swing",
  group: "Animation",
  animated: true,
  params: [],
  apply: (
    ctx: CanvasRenderingContext2D,
    t: number,
    _w: number,
    h: number
  ): void => {
    ctx.translate(0, -h / 2)
    ctx.rotate(Math.sin(t * 2) * 0.22)
    ctx.translate(0, h / 2)
  },
}

const shake: AnimDef = {
  kind: "anim",
  id: "shake",
  name: "Shake",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    ctx.translate(Math.sin(t * 38) * 3, Math.cos(t * 31) * 2)
  },
}

const bounce: AnimDef = {
  kind: "anim",
  id: "bounce",
  name: "Bounce",
  group: "Animation",
  animated: true,
  params: [],
  apply: (
    ctx: CanvasRenderingContext2D,
    t: number,
    _w: number,
    h: number
  ): void => {
    ctx.translate(0, -Math.abs(Math.sin(t * 3)) * h * 0.12)
  },
}

const pop: AnimDef = {
  kind: "anim",
  id: "pop",
  name: "Pop",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    const s = 1 + (0.5 + 0.5 * Math.sin(t * 4)) * 0.1
    ctx.scale(s, s)
  },
}

const flip3d: AnimDef = {
  kind: "anim",
  id: "flip3d",
  name: "Flip 3D",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    // horizontal flip — looks like a card rotating in 3D
    const sx = Math.cos(t * 1.5)
    ctx.scale(sx || 0.001, 1)
  },
}

const tilt3d: AnimDef = {
  kind: "anim",
  id: "tilt3d",
  name: "Tilt 3D",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    // oscillating pseudo rotateY via shear + horizontal squash
    const a = Math.sin(t * 1.3) * 0.6
    ctx.transform(Math.cos(a), Math.sin(a) * 0.12, -Math.sin(a) * 0.35, 1, 0, 0)
  },
}

const heartbeat: AnimDef = {
  kind: "anim",
  id: "heartbeat",
  name: "Heartbeat",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    // sharp double-thump: a steep pulse that quickly relaxes
    const s = 1 + Math.pow(Math.max(0, Math.sin(t * 4)), 6) * 0.14
    ctx.scale(s, s)
  },
}

const jelly: AnimDef = {
  kind: "anim",
  id: "jelly",
  name: "Jelly",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    // squash-and-stretch: width and height oscillate out of phase (area ~const)
    const sx = 1 + Math.sin(t * 6) * 0.08
    ctx.scale(sx, 2 - sx)
  },
}

const rubber: AnimDef = {
  kind: "anim",
  id: "rubber",
  name: "Rubber",
  group: "Animation",
  animated: true,
  params: [],
  apply: (ctx: CanvasRenderingContext2D, t: number): void => {
    const sx = 1 + Math.sin(t * 3) * 0.12
    ctx.scale(sx, 1 / sx)
  },
}

const orbit: AnimDef = {
  kind: "anim",
  id: "orbit",
  name: "Orbit",
  group: "Animation",
  animated: true,
  params: [],
  apply: (
    ctx: CanvasRenderingContext2D,
    t: number,
    _w: number,
    h: number
  ): void => {
    ctx.translate(Math.cos(t * 2) * h * 0.06, Math.sin(t * 2) * h * 0.06)
  },
}

/** Every anim def, in legacy ANIMS[] order, `none` first. */
export const ANIMS: AnimDef[] = [
  none,
  float,
  pulse,
  spin,
  wobble,
  swing,
  shake,
  bounce,
  pop,
  flip3d,
  tilt3d,
  heartbeat,
  jelly,
  rubber,
  orbit,
]

registerAll(ANIMS)
