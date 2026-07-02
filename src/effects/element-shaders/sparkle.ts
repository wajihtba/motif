import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const sparkle: ElementShaderDef[] = [
  // Sparkle — twinkling 4-point glints around the content (premium / new). OFF mask.
  {
    kind: "element-shader",
    id: "sparkle",
    name: "Sparkle",
    group: "Sparkle",
    animated: true,
    animateByDefault: true,
    maskable: false,
    params: [
      {
        key: "density",
        label: "Density",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "size", label: "Size", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0.1, max: 4, step: 0.05, def: 1.4 },
      {
        key: "intensity",
        label: "Intensity",
        min: 0,
        max: 1.5,
        step: 0.01,
        def: 0.9,
      },
    ],
    frag: `
vec4 fx(){
  float density = ${P(0)}, size = ${P(1)}, speed = ${P(2)}, intensity = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float grid = mix(4.0, 13.0, density);
  vec2 g = v_uv * grid;
  vec2 id = floor(g);
  vec2 rnd = hash22(id);
  vec2 f = fract(g) - 0.5 - (rnd - 0.5) * 0.6;
  float tw = pow(0.5 + 0.5 * sin(u_time * speed * 3.0 + (rnd.x + rnd.y) * 30.0), 4.0);
  float star = clamp(mix(0.12, 0.4, size) * 0.25 / (abs(f.x) * abs(f.y) * 40.0 + 0.02), 0.0, 1.0);
  float spark = star * tw * step(0.58, rnd.x);
  vec3 col = el.rgb + spark * intensity * vec3(1.0, 0.95, 0.8);
  return vec4(col, clamp(el.a + spark, 0.0, 1.0));
}`,
  },

  // Shine border — glowing animated outline ring for CTA buttons. OFF mask.
  {
    kind: "element-shader",
    id: "shineBorder",
    name: "Shine border",
    group: "Sparkle",
    animated: true,
    animateByDefault: true,
    maskable: false,
    params: [
      {
        key: "width",
        label: "Thickness",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.4,
      },
      { key: "glow", label: "Glow", min: 0, max: 1.5, step: 0.01, def: 0.9 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 1.0 },
      { key: "hue", label: "Hue", min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float width = ${P(0)}, glow = ${P(1)}, speed = ${P(2)}, hue = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 q = abs(v_uv - 0.5);
  float edge = max(q.x, q.y);
  float ring = smoothstep(0.5 - mix(0.02, 0.14, width), 0.5, edge);
  float a = atan(v_uv.y - 0.5, v_uv.x - 0.5);
  vec3 c = hsv2rgb(vec3(fract(hue + a / 6.2831 + u_time * speed * 0.2), 0.8, 1.0));
  vec3 col = el.rgb + ring * c * glow;
  return vec4(col, clamp(max(el.a, ring), 0.0, 1.0));
}`,
  },

  // Starburst — radial sale rays behind the content (the SALE % badge look). OFF mask.
  {
    kind: "element-shader",
    id: "starburst",
    name: "Starburst",
    group: "Sparkle",
    animated: true,
    animateByDefault: true,
    maskable: false,
    params: [
      { key: "rays", label: "Ray count", min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: "hue", label: "Hue", min: 0, max: 1, step: 0.01, def: 0.02 },
      { key: "speed", label: "Spin", min: 0, max: 3, step: 0.05, def: 0.5 },
      {
        key: "contrast",
        label: "Contrast",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
    ],
    frag: `
vec4 fx(){
  float rays = ${P(0)}, hue = ${P(1)}, speed = ${P(2)}, contrast = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 p = v_uv - 0.5;
  float a = atan(p.y, p.x);
  float n = mix(8.0, 30.0, rays);
  float r = pow(0.5 + 0.5 * sin(a * n + u_time * speed), mix(1.0, 4.0, contrast));
  float vig = smoothstep(0.78, 0.0, length(p));
  vec3 burst = mix(hsv2rgb(vec3(fract(hue + 0.08), 0.9, 0.7)), hsv2rgb(vec3(hue, 0.85, 1.0)), r) * vig;
  vec3 col = mix(burst, el.rgb, el.a);
  return vec4(col, max(el.a, vig * 0.92));
}`,
  },
]
