import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

// ── Paper-design / cult-ui ports ─────────────────────────────────────────
// Faithful re-creations of the open-source @paper-design/shaders hero looks,
// re-expressed in this engine's fx() convention. Each reads the element's
// own alpha as the "shape mask" (paper's u_image edge/opacity field), so they
// shine on a selected block AND, with Mask-to-content on, on a logo/PNG/text.

export const paper: ElementShaderDef[] = [
  // Dithering — ordered Bayer dither of a flowing fbm field blended with the
  // content's luminance, mapped to a two-tone palette (paper-design Dithering).
  {
    kind: "element-shader",
    id: "dithering",
    name: "Dithering (element)",
    group: "Paper",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      {
        key: "scale",
        label: "Pixel size",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "levels", label: "Levels", min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: "warp", label: "Flow", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "hue", label: "Hue", min: 0, max: 1, step: 0.01, def: 0.58 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.8 },
    ],
    frag: `
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
vec4 fx(){
  float scale = ${P(0)}, levels = ${P(1)}, warp = ${P(2)}, hue = ${P(3)}, speed = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  float t = u_time * speed;
  float field = fbm(v_uv * mix(2.0, 7.0, warp) + vec2(t * 0.3, -t * 0.2));
  field = mix(field, lumc(el.rgb), 0.5);
  float cell = mix(2.0, 9.0, scale);
  vec2 bp = floor(v_uv * u_res / cell);
  float th = bayer2(0.5 * bp) * 0.25 + bayer2(bp);   // 4x4 ordered matrix
  float n = mix(2.0, 5.0, levels);
  float q = clamp(floor(field * n + th) / (n - 1.0), 0.0, 1.0);
  vec3 lo = hsv2rgb(vec3(hue, 0.6, 0.06));
  vec3 hi = hsv2rgb(vec3(fract(hue + 0.08), 0.5, 1.0));
  return vec4(mix(lo, hi, q), el.a);
}`,
  },

  // Heatmap — flowing fbm biased by the content brightness, mapped through a
  // cool→hot thermal ramp with a white-hot core (paper-design Heatmap).
  {
    kind: "element-shader",
    id: "heatmap",
    name: "Heatmap",
    group: "Paper",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "scale", label: "Scale", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.8 },
      {
        key: "contrast",
        label: "Contrast",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "range",
        label: "Hue range",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.8,
      },
      { key: "glow", label: "Hot core", min: 0, max: 1, step: 0.01, def: 0.4 },
    ],
    frag: `
vec4 fx(){
  float scale = ${P(0)}, speed = ${P(1)}, contrast = ${P(2)}, range = ${P(3)}, glow = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  float t = u_time * speed;
  float n = fbm(v_uv * mix(2.0, 8.0, scale) + vec2(t * 0.4, t * 0.25));
  n = mix(n, lumc(el.rgb), 0.45);
  n = clamp((n - 0.5) * mix(1.0, 2.6, contrast) + 0.5, 0.0, 1.0);
  float hue = mix(0.7, 0.0, n) * mix(0.6, 1.0, range);   // violet/blue → red
  vec3 heat = hsv2rgb(vec3(hue, 1.0, n * 0.7 + 0.3));
  heat += pow(n, 4.0) * glow;                            // white-hot core
  return vec4(heat, el.a);
}`,
  },

  // Color panels — stacked translucent rotating colour planes, screen-blended
  // over the content (paper-design ColorPanels).
  {
    kind: "element-shader",
    id: "colorPanels",
    name: "Color panels",
    group: "Paper",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "count", label: "Panels", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.6 },
      { key: "sat", label: "Saturation", min: 0, max: 1, step: 0.01, def: 0.7 },
      { key: "angle", label: "Angle", min: 0, max: 1, step: 0.01, def: 0.0 },
      {
        key: "blend",
        label: "Frequency",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
    ],
    frag: `
vec4 fx(){
  float count = ${P(0)}, speed = ${P(1)}, sat = ${P(2)}, angle = ${P(3)}, blend = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  float t = u_time * speed;
  vec2 p = v_uv - 0.5;
  float n = floor(mix(2.0, 6.0, count));
  vec3 col = vec3(0.0); float wsum = 0.0;
  for (int i = 0; i < 6; i++){
    if (float(i) >= n) break;
    float fi = float(i);
    float ang = angle * 6.2831 + fi * 2.4 + t * 0.3;
    vec2 dir = vec2(cos(ang), sin(ang));
    float wave = 0.5 + 0.5 * sin(dot(p, dir) * 6.2831 * mix(0.6, 2.0, blend) + fi * 1.7 + t);
    float panel = smoothstep(0.35, 0.65, wave);
    vec3 c = hsv2rgb(vec3(fract(fi / n + t * 0.05), sat, 1.0));
    col += c * panel; wsum += panel;
  }
  col = wsum > 0.0 ? col / wsum : col;
  vec3 outc = 1.0 - (1.0 - el.rgb) * (1.0 - col * 0.85);   // screen blend
  return vec4(mix(el.rgb, outc, 0.85), el.a);
}`,
  },

  // Static radial gradient — two drifting radial colour poles over a deep base
  // with a touch of grain (paper-design StaticRadialGradient, gently animated).
  {
    kind: "element-shader",
    id: "radialGradient",
    name: "Radial mesh",
    group: "Paper",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "spread", label: "Spread", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "softness",
        label: "Softness",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: "hue", label: "Hue", min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float spread = ${P(0)}, softness = ${P(1)}, grain = ${P(2)}, hue = ${P(3)}, speed = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  float t = u_time * speed;
  vec2 p = v_uv - 0.5;
  vec2 a = 0.25 * vec2(sin(t * 0.7), cos(t * 0.5));
  vec2 b = 0.25 * vec2(cos(t * 0.4 + 1.0), sin(t * 0.6 + 2.0));
  float g1 = smoothstep(mix(0.1, 0.7, spread), 0.0, length(p - a));
  float g2 = smoothstep(mix(0.1, 0.7, spread), 0.0, length(p - b));
  float soft = mix(0.6, 2.0, softness);
  vec3 base = hsv2rgb(vec3(fract(hue + 0.5), 0.5, 0.15));
  vec3 col = base;
  col = mix(col, hsv2rgb(vec3(hue, 0.7, 1.0)), pow(g1, soft));
  col = mix(col, hsv2rgb(vec3(fract(hue + 0.12), 0.6, 1.0)), pow(g2, soft));
  col += (hash21(v_uv * u_res) - 0.5) * grain * 0.12;
  return vec4(mix(el.rgb, col, 0.92), el.a);
}`,
  },
]
