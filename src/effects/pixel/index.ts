// Pixel-effect catalogue — v2 REWRITE as fragment shaders (docs/plan/
// 02-performance.md §2): the v1 CPU getImageData ops are now GLSL `fx()`
// bodies run through the shared element stage, keeping the frame path
// GPU-resident. Ids and params match v1 so existing scenes stay compatible.

import type { PixelDef } from "../core/types"
import { registerAll } from "../core/registry"

/** The "no pixel effect" sentinel — passes the source through untouched. */
const none: PixelDef = {
  kind: "pixel",
  id: "none",
  name: "None",
  group: "Pixel",
  animated: false,
  params: [],
  frag: `vec4 fx(){ return texture2D(u_tex, v_uv); }`,
}

/** GPU approximation of the classic vertical pixel-sort "drip": within the
 *  same luminance band the CPU version sorted (35..215), brighter pixels
 *  smear downward by marching up-column for the brightest candidate. */
const sort: PixelDef = {
  kind: "pixel",
  id: "sort",
  name: "Pixel sort",
  group: "Pixel",
  animated: false,
  params: [
    {
      key: "length",
      label: "Drip length",
      min: 0.02,
      max: 0.5,
      step: 0.01,
      def: 0.18,
    },
  ],
  frag: `
vec4 fx(){
  vec4 c = texture2D(u_tex, v_uv);
  float l = lumc(c.rgb);
  if (l < 0.137 || l > 0.843) return c; // outside the sortable band (35..215)
  float span = u_p[0];
  vec4 best = c;
  float bl = l;
  for (int i = 1; i <= 24; i++) {
    float o = float(i) / 24.0 * span;
    vec2 uv = v_uv - vec2(0.0, o);
    if (uv.y < 0.0) break;
    vec4 s = texture2D(u_tex, uv);
    float sl = lumc(s.rgb);
    if (sl < 0.137 || sl > 0.843) break; // band edge ends the run
    // lower pixels prefer brighter candidates → sorted-looking streaks
    float want = mix(bl, 1.0, o / max(span, 1e-4));
    if (sl > want) { best = s; bl = sl; }
  }
  return best;
}`,
}

/** GLSL port of the noise-threshold dissolve (byte-faithful thresholds). */
const dissolve: PixelDef = {
  kind: "pixel",
  id: "dissolve",
  name: "Dissolve",
  group: "Pixel",
  animated: false,
  params: [],
  frag: `
vec4 fx(){
  vec4 c = texture2D(u_tex, v_uv);
  float l = lumc(c.rgb);
  float n = hash21(floor(v_uv * u_res));
  if (n > l * 1.15 + 0.08) {
    c.rgb *= vec3(0.15, 0.15, 0.2);         // dissolve this grain: darken & fade
  } else if (n > l * 0.9) {
    c.rgb = min(vec3(1.0), c.rgb * 1.4 + 40.0 / 255.0); // edge sparkle
  }
  return c;
}`,
}

/** Every pixel def, `none` first. */
export const PIXELS: PixelDef[] = [none, sort, dissolve]

registerAll(PIXELS)
