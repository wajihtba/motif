import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const textFx: ElementShaderDef[] = [
  // ── Hologram — cyan scanlines, chroma, flicker, additive rim glow ────────
  {
    kind: "element-shader",
    id: "hologram",
    name: "Hologram",
    group: "Text FX",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "scan", label: "Scanlines", min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: "chroma", label: "Chroma", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "flicker",
        label: "Flicker",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.4,
      },
      { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: "jitter", label: "Jitter", min: 0, max: 1, step: 0.01, def: 0.3 },
      {
        key: "tint",
        label: "Tint color",
        type: "color",
        min: 0,
        max: 0xffffff,
        step: 1,
        def: 0x59ffff, // holo cyan
      },
    ],
    frag: `
vec4 fx(){
  float scan = ${P(0)}, chroma = ${P(1)}, flicker = ${P(2)}, glow = ${P(3)}, jitter = ${P(4)};
  float t = u_time;
  vec2 uv = v_uv;
  uv.x += (hash21(vec2(floor(uv.y * 120.0), floor(t * 12.0))) - 0.5) * jitter * 0.02;
  float s = chroma * 0.012;
  vec4 cr = texture2D(u_tex, uv + vec2(s, 0.0));
  vec4 cg = texture2D(u_tex, uv);
  vec4 cb = texture2D(u_tex, uv - vec2(s, 0.0));
  float a = max(cr.a, max(cg.a, cb.a));
  vec3 col = vec3(cr.r, cg.g, cb.b);
  vec3 tint = up_rgb(${P(5)});
  col = mix(col, col * tint + tint * 0.12, 0.65);
  float sl = 0.5 + 0.5 * sin(uv.y * u_res.y * 0.5 - t * 8.0);
  col *= mix(1.0, sl, scan * 0.6);
  col *= 1.0 - flicker * 0.3 * hash21(vec2(floor(t * 20.0), 1.0));
  col += tint * glow * 0.28 * a;
  return vec4(col, a);
}`,
  },

  // ── Neon — glowing tube + soft outer halo (leave Mask OFF) ───────────────
  {
    kind: "element-shader",
    id: "neon",
    name: "Neon glow",
    group: "Text FX",
    animated: true,
    animateByDefault: false,
    maskable: false,
    params: [
      { key: "hue", label: "Hue", min: 0, max: 1, step: 0.01, def: 0.83 },
      { key: "glow", label: "Glow", min: 0, max: 1.5, step: 0.01, def: 0.8 },
      { key: "width", label: "Spread", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "flicker",
        label: "Flicker",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.25,
      },
      { key: "core", label: "Tube", min: 0, max: 1, step: 0.01, def: 0.7 },
    ],
    frag: `
vec4 fx(){
  float hue = ${P(0)}, glow = ${P(1)}, width = ${P(2)}, flicker = ${P(3)}, core = ${P(4)};
  vec2 px = 1.0 / u_res;
  float halo = 0.0;
  for (int i = 0; i < 12; i++){
    float ang = float(i) / 12.0 * 6.2831;
    halo += texture2D(u_tex, v_uv + vec2(cos(ang), sin(ang)) * px * mix(2.0, 20.0, width)).a;
  }
  halo /= 12.0;
  float self = texture2D(u_tex, v_uv).a;
  vec3 color = hsv2rgb(vec3(hue, 0.85, 1.0));
  float fl = 1.0 - flicker * 0.3 * step(0.92, hash21(vec2(floor(u_time * 14.0), 3.0)));
  vec3 col = color * halo * glow * 2.2 * fl;           // outer halo
  col += mix(color, vec3(1.0), core) * self;           // bright tube core
  return vec4(col, clamp(max(self, halo * glow), 0.0, 1.0));
}`,
  },

  // ── Fire — flames licking up off the content silhouette (Mask OFF) ───────
  {
    kind: "element-shader",
    id: "fire",
    name: "Fire",
    group: "Text FX",
    animated: true,
    animateByDefault: true,
    maskable: false,
    params: [
      { key: "height", label: "Height", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0.1, max: 4, step: 0.05, def: 1.6 },
      { key: "detail", label: "Detail", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "intensity",
        label: "Intensity",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.7,
      },
    ],
    frag: `
vec4 fx(){
  float height = ${P(0)}, speed = ${P(1)}, detail = ${P(2)}, intensity = ${P(3)};
  float t = u_time * speed;
  float self = texture2D(u_tex, v_uv).a;
  // sample the content sitting BELOW this pixel (v grows downward) so flames rise
  float src = texture2D(u_tex, v_uv + vec2(0.0, mix(0.05, 0.35, height))).a;
  float n = fbm(vec2(v_uv.x * mix(3.0, 8.0, detail), v_uv.y * mix(3.0, 6.0, detail) + t * 3.0));
  float lick = src * smoothstep(0.2, 1.0, n) * (1.0 - self);
  float heat = clamp(self + lick * 1.4, 0.0, 1.0);
  vec3 col = vec3(1.7, 0.6, 0.12) * heat + vec3(1.5, 1.2, 0.3) * pow(heat, 3.0);
  col = mix(texture2D(u_tex, v_uv).rgb, col, clamp(self + lick, 0.0, 1.0) * intensity + self * (1.0 - intensity));
  return vec4(col, clamp(self + lick, 0.0, 1.0));
}`,
  },

  // ── Emboss — 3D bevel / extrude lit from the alpha heightmap ──────────────
  {
    kind: "element-shader",
    id: "emboss",
    name: "3D bevel",
    group: "Text FX",
    animated: false,
    animateByDefault: false,
    maskable: true,
    params: [
      { key: "depth", label: "Depth", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "light",
        label: "Light angle",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.62,
      },
      {
        key: "ambient",
        label: "Ambient",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.45,
      },
      {
        key: "round",
        label: "Roundness",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
    ],
    frag: `
vec4 fx(){
  float depth = ${P(0)}, light = ${P(1)}, ambient = ${P(2)}, rnd = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 px = 1.0 / u_res;
  vec2 g = vec2(texture2D(u_tex, v_uv - vec2(px.x,0.0)).a - texture2D(u_tex, v_uv + vec2(px.x,0.0)).a,
                texture2D(u_tex, v_uv - vec2(0.0,px.y)).a - texture2D(u_tex, v_uv + vec2(0.0,px.y)).a);
  vec3 N = normalize(vec3(g * mix(2.0, 11.0, depth), 1.0 / mix(0.2, 2.0, rnd)));
  float ang = light * 6.2831;
  vec3 L = normalize(vec3(cos(ang), sin(ang), 0.8));
  float diff = max(0.0, dot(N, L));
  float spec = pow(max(0.0, dot(reflect(-L, N), vec3(0.0, 0.0, 1.0))), 24.0);
  vec3 col = el.rgb * (ambient + diff) + spec;
  return vec4(col, el.a);
}`,
  },

  // ── Long shadow — flat directional shadow behind the content (Mask OFF) ──
  {
    kind: "element-shader",
    id: "longShadow",
    name: "Long shadow",
    group: "Text FX",
    animated: false,
    animateByDefault: false,
    maskable: false,
    params: [
      { key: "length", label: "Length", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "angle", label: "Angle", min: 0, max: 1, step: 0.01, def: 0.62 },
      {
        key: "opacity",
        label: "Opacity",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.4,
      },
      { key: "fade", label: "Fade", min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float len = ${P(0)}, angle = ${P(1)}, opacity = ${P(2)}, fade = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float ang = angle * 6.2831;
  vec2 dir = vec2(cos(ang), sin(ang)) / u_res * 2.0;
  float steps = mix(10.0, 80.0, len);
  float sh = 0.0;
  for (int i = 1; i <= 80; i++){
    if (float(i) > steps) break;
    float s = texture2D(u_tex, v_uv - dir * float(i)).a;
    sh = max(sh, s * (1.0 - float(i) / steps * fade));
  }
  vec3 col = mix(vec3(0.0), el.rgb, el.a);   // content over a black shadow
  return vec4(col, max(el.a, sh * opacity));
}`,
  },

  // ── Sticker — die-cut outline + drop shadow (Mask OFF) ────────────────────
  {
    kind: "element-shader",
    id: "sticker",
    name: "Sticker",
    group: "Text FX",
    animated: false,
    animateByDefault: false,
    maskable: false,
    params: [
      { key: "thick", label: "Border", min: 0, max: 1, step: 0.01, def: 0.45 },
      { key: "shadow", label: "Shadow", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "hue", label: "Border hue", min: 0, max: 1, step: 0.01, def: 0.0 },
    ],
    frag: `
vec4 fx(){
  float thick = ${P(0)}, shadow = ${P(1)}, hue = ${P(2)};
  vec2 px = 1.0 / u_res;
  float border = 0.0;
  for (int i = 0; i < 16; i++){
    float ang = float(i) / 16.0 * 6.2831;
    border = max(border, texture2D(u_tex, v_uv + vec2(cos(ang), sin(ang)) * px * mix(3.0, 22.0, thick)).a);
  }
  float sh = 0.0;
  for (int i = 0; i < 12; i++){
    sh = max(sh, texture2D(u_tex, v_uv - px * vec2(1.0, 1.0) * float(i) * mix(1.0, 4.0, shadow)).a);
  }
  vec4 el = texture2D(u_tex, v_uv);
  vec3 borderCol = hue > 0.001 ? hsv2rgb(vec3(hue, 0.75, 1.0)) : vec3(1.0);
  vec3 col = vec3(0.0);
  float a = sh * 0.45;                 // drop shadow
  col = mix(col, borderCol, border);   // die-cut border
  a = max(a, border);
  col = mix(col, el.rgb, el.a);        // content on top
  return vec4(col, max(a, el.a));
}`,
  },

  // ── Shine — premium gloss light-sweep across the content ─────────────────
  {
    kind: "element-shader",
    id: "shine",
    name: "Gloss sweep",
    group: "Text FX",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      {
        key: "width",
        label: "Width",
        min: 0.02,
        max: 0.5,
        step: 0.01,
        def: 0.16,
      },
      { key: "angle", label: "Angle", min: 0, max: 1, step: 0.01, def: 0.25 },
      { key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, def: 1.0 },
      {
        key: "intensity",
        label: "Intensity",
        min: 0,
        max: 1.5,
        step: 0.01,
        def: 0.7,
      },
    ],
    frag: `
vec4 fx(){
  float width = ${P(0)}, angle = ${P(1)}, speed = ${P(2)}, intensity = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float ang = angle * 3.14159;
  vec2 dir = vec2(cos(ang), sin(ang));
  float proj = dot(v_uv - 0.5, dir) + 0.5;
  float sweep = fract(u_time * speed * 0.25) * 1.4 - 0.2;   // sweep past both edges
  float band = smoothstep(width, 0.0, abs(proj - sweep));
  return vec4(el.rgb + band * intensity, el.a);
}`,
  },

  // Scanlines — retro CRT lines + phosphor tint over one element.
  {
    kind: "element-shader",
    id: "scanlines",
    name: "Scanlines",
    group: "Text FX",
    animated: true,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "density",
        label: "Density",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "strength",
        label: "Strength",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "flicker",
        label: "Flicker",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.2,
      },
      { key: "tint", label: "Phosphor", min: 0, max: 1, step: 0.01, def: 0.3 },
    ],
    frag: `
vec4 fx(){
  float density = ${P(0)}, strength = ${P(1)}, flicker = ${P(2)}, tint = ${P(3)};
  vec4 el = texture2D(u_tex, v_uv);
  float lines = 0.5 + 0.5 * sin(v_uv.y * u_res.y * mix(0.3, 1.0, density));
  vec3 col = el.rgb * (1.0 - strength * 0.5 * (1.0 - lines));
  col *= 1.0 - flicker * 0.2 * hash21(vec2(floor(u_time * 20.0), 1.0));
  col = mix(col, col * vec3(0.6, 1.0, 0.9), tint);
  return vec4(col, el.a);
}`,
  },
]
