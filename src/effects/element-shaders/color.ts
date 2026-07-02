import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const color: ElementShaderDef[] = [
  // ── Duotone — gradient-map the content between two brand hues ─────────────
  {
    kind: "element-shader",
    id: "duotone",
    name: "Duotone",
    group: "Color",
    animated: false,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "hueA",
        label: "Shadow hue",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.72,
      },
      {
        key: "hueB",
        label: "Light hue",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.95,
      },
      {
        key: "contrast",
        label: "Contrast",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 1.0 },
    ],
    frag: `
vec4 fx(){
  float hueA = ${P(0)}, hueB = ${P(1)}, contrast = ${P(2)}, amount = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float l = clamp((lumc(el.rgb) - 0.5) * mix(1.0, 2.2, contrast) + 0.5, 0.0, 1.0);
  vec3 duo = mix(hsv2rgb(vec3(hueA, 0.7, 0.25)), hsv2rgb(vec3(hueB, 0.7, 1.0)), smoothstep(0.0, 1.0, l));
  return vec4(mix(el.rgb, duo, amount), el.a);
}`,
  },

  // ── Comic — cel posterize + halftone shading + ink edges ──────────────────
  {
    kind: "element-shader",
    id: "comic",
    name: "Comic",
    group: "Color",
    animated: false,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "levels",
        label: "Cel levels",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "dot", label: "Halftone", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "ink", label: "Ink", min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: "sat", label: "Saturation", min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float levels = ${P(0)}, dotSize = ${P(1)}, ink = ${P(2)}, sat = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float l = lumc(el.rgb);
  float n = mix(2.0, 6.0, levels);
  vec3 cel = floor(el.rgb * n) / (n - 1.0);
  cel = mix(vec3(l), cel, mix(1.0, 1.6, sat));
  float scale = mix(11.0, 4.0, dotSize);
  vec2 p = fract(v_uv * u_res / scale) - 0.5;
  cel = mix(cel, cel * 0.6, step(length(p), (1.0 - l) * 0.5) * 0.5);
  vec2 px = 1.0 / u_res;
  float e = abs(lumc(texture2D(u_tex, v_uv + vec2(px.x,0.0)).rgb) - lumc(texture2D(u_tex, v_uv - vec2(px.x,0.0)).rgb))
          + abs(lumc(texture2D(u_tex, v_uv + vec2(0.0,px.y)).rgb) - lumc(texture2D(u_tex, v_uv - vec2(0.0,px.y)).rgb));
  cel = mix(cel, vec3(0.04), clamp(e * ink * 4.0, 0.0, 1.0));
  return vec4(cel, el.a);
}`,
  },

  // Rainbow — animated multi-hue gradient fill over the content.
  {
    kind: "element-shader",
    id: "rainbow",
    name: "Rainbow",
    group: "Color",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.6 },
      { key: "scale", label: "Spread", min: 0.2, max: 5, step: 0.05, def: 1.5 },
      {
        key: "sat",
        label: "Saturation",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.85,
      },
      { key: "angle", label: "Angle", min: 0, max: 1, step: 0.01, def: 0.25 },
    ],
    frag: `
vec4 fx(){
  float speed = ${P(0)}, scale = ${P(1)}, sat = ${P(2)}, angle = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float ang = angle * 3.14159;
  float g = dot(v_uv, vec2(cos(ang), sin(ang)));
  vec3 rb = hsv2rgb(vec3(fract(g * scale + u_time * speed * 0.1), sat, 1.0));
  return vec4(rb, el.a);
}`,
  },
]
