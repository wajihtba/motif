import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const distortion: ElementShaderDef[] = [
  // ── Glitch — datamosh RGB split + block displacement + noise lines ───────
  {
    kind: "element-shader",
    id: "glitch",
    name: "Glitch",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      {
        key: "intensity",
        label: "Intensity",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.6,
      },
      {
        key: "blocks",
        label: "Block size",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "split",
        label: "RGB split",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "speed", label: "Speed", min: 0.1, max: 4, step: 0.05, def: 1.4 },
      { key: "noise", label: "Static", min: 0, max: 1, step: 0.01, def: 0.4 },
    ],
    frag: `
vec4 fx(){
  float intensity = ${P(0)}, blocks = ${P(1)}, split = ${P(2)}, speed = ${P(3)}, noiseAmt = ${P(4)};
  float t = u_time * speed;
  vec2 uv = v_uv;
  float rows = mix(4.0, 44.0, blocks);
  float row = floor(uv.y * rows);
  float g = hash21(vec2(row, floor(t * 9.0)));
  float shift = (g - 0.5) * intensity * 0.12 * step(0.55, g);
  uv.x = fract(uv.x + shift);
  float s = split * intensity * 0.02;
  vec4 cr = texture2D(u_tex, uv + vec2(s, 0.0));
  vec4 cg = texture2D(u_tex, uv);
  vec4 cb = texture2D(u_tex, uv - vec2(s, 0.0));
  float a = max(cr.a, max(cg.a, cb.a));
  vec3 col = vec3(cr.r, cg.g, cb.b);
  float line = step(0.992, hash21(vec2(floor(uv.y * rows), floor(t * 22.0))));
  col = mix(col, vec3(1.0), line * noiseAmt);
  return vec4(col, a);
}`,
  },

  // ── Pixel break — quantize into cells, scatter & fall apart ──────────────
  {
    kind: "element-shader",
    id: "pixelBreak",
    name: "Pixel break",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "cell", label: "Cell size", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "amount", label: "Break", min: 0, max: 1, step: 0.01, def: 0.55 },
      {
        key: "scatter",
        label: "Scatter",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "gravity",
        label: "Gravity",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.3,
      },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 1.0 },
    ],
    frag: `
vec4 fx(){
  float cell = ${P(0)}, amount = ${P(1)}, scatter = ${P(2)}, gravity = ${P(3)}, speed = ${P(4)};
  // animate: blocks fly apart and reassemble; static: hold at the amount
  float pr = mix(amount, amount * (0.5 + 0.5 * sin(u_time * speed)), step(0.001, speed));
  float grid = mix(70.0, 9.0, cell);
  vec2 cid = floor(v_uv * grid);
  vec2 rnd = hash22(cid + 0.5);
  vec2 disp = (rnd - 0.5) * 2.0 * pr * scatter * 0.5;
  disp.y += pr * pr * gravity * 0.6;
  vec2 cuv = (cid + 0.5) / grid - disp;
  vec4 c = texture2D(u_tex, cuv);
  float fade = 1.0 - smoothstep(0.0, 1.0, pr * (0.55 + rnd.x * 0.9));
  return vec4(c.rgb, c.a * fade);
}`,
  },

  // ── Liquid morph — fbm domain-warp, gooey flowing content ────────────────
  {
    kind: "element-shader",
    id: "liquidMorph",
    name: "Liquid morph",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "amp", label: "Amplitude", min: 0, max: 1, step: 0.01, def: 0.45 },
      {
        key: "freq",
        label: "Frequency",
        min: 0.5,
        max: 8,
        step: 0.1,
        def: 3.0,
      },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.8 },
      { key: "chroma", label: "Chroma", min: 0, max: 1, step: 0.01, def: 0.3 },
    ],
    frag: `
vec4 fx(){
  float amp = ${P(0)}, freq = ${P(1)}, speed = ${P(2)}, chroma = ${P(3)};
  float t = u_time * speed;
  vec2 uv = v_uv;
  vec2 q = vec2(fbm(uv * freq + vec2(0.0, t)), fbm(uv * freq + vec2(5.2, 1.3 - t)));
  vec2 w = uv + (q - 0.5) * amp * 0.22;
  vec2 dir = normalize(w - uv + 1e-5);
  float s = chroma * 0.012;
  vec4 cr = texture2D(u_tex, w + dir * s);
  vec4 cg = texture2D(u_tex, w);
  vec4 cb = texture2D(u_tex, w - dir * s);
  return vec4(cr.r, cg.g, cb.b, cg.a);
}`,
  },

  // ── Dissolve — fbm threshold burn with a glowing ember edge ──────────────
  {
    kind: "element-shader",
    id: "dissolve",
    name: "Dissolve burn",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      {
        key: "threshold",
        label: "Reveal",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      {
        key: "edge",
        label: "Ember edge",
        min: 0.01,
        max: 0.3,
        step: 0.01,
        def: 0.1,
      },
      { key: "scale", label: "Grain", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.8 },
    ],
    frag: `
vec4 fx(){
  float threshold = ${P(0)}, edge = ${P(1)}, scale = ${P(2)}, speed = ${P(3)};
  float th = mix(threshold, 0.5 + 0.5 * sin(u_time * speed), step(0.001, speed));
  vec4 c = texture2D(u_tex, v_uv);
  float n = fbm(v_uv * mix(3.0, 18.0, scale));
  float reveal = smoothstep(th - 0.02, th + 0.02, n);
  float ember = 1.0 - smoothstep(0.0, edge, abs(n - th));
  vec3 burn = vec3(1.0, 0.5, 0.12) * ember * 2.2;
  vec3 col = c.rgb * reveal + burn * c.a;
  float a = max(c.a * reveal, ember * c.a);
  return vec4(col, a);
}`,
  },

  // ── Ripple — concentric water ripples / shockwave ────────────────────────
  {
    kind: "element-shader",
    id: "ripple",
    name: "Ripple",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "amp", label: "Amplitude", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "freq", label: "Frequency", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 1.0 },
      { key: "decay", label: "Falloff", min: 0, max: 1, step: 0.01, def: 0.4 },
    ],
    frag: `
vec4 fx(){
  float amp = ${P(0)}, freq = ${P(1)}, speed = ${P(2)}, decay = ${P(3)};
  vec2 c = v_uv - 0.5;
  float r = length(c);
  float w = sin(r * mix(10.0, 60.0, freq) - u_time * speed * 4.0);
  float fall = exp(-r * mix(1.0, 8.0, decay));
  vec2 uv = v_uv + normalize(c + 1e-5) * w * fall * amp * 0.05;
  vec4 col = texture2D(u_tex, uv);
  col.rgb += w * fall * 0.06;
  return col;
}`,
  },

  // ── Wave — wavy flag distortion ──────────────────────────────────────────
  {
    kind: "element-shader",
    id: "wave",
    name: "Wave",
    group: "Distortion",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "amp", label: "Amplitude", min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: "freq", label: "Frequency", min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: "speed", label: "Speed", min: 0, max: 4, step: 0.05, def: 1.5 },
      { key: "axis", label: "Axis", min: 0, max: 1, step: 0.01, def: 0.0 },
    ],
    frag: `
vec4 fx(){
  float amp = ${P(0)}, freq = ${P(1)}, speed = ${P(2)}, axis = ${P(3)};
  float t = u_time * speed;
  float wx = sin(v_uv.y * mix(2.0, 16.0, freq) + t) * amp * 0.05;
  float wy = sin(v_uv.x * mix(2.0, 16.0, freq) + t * 1.3) * amp * 0.05;
  return texture2D(u_tex, v_uv + vec2(wx * (1.0 - axis), wy * axis));
}`,
  },

  // ── Pixelate — clean retro mosaic of the content ─────────────────────────
  {
    kind: "element-shader",
    id: "pixelate",
    name: "Pixelate",
    group: "Distortion",
    animated: false,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "cell",
        label: "Cell size",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.45,
      },
    ],
    frag: `
vec4 fx(){
  float cell = ${P(0)};
  float grid = mix(60.0, 8.0, cell);
  vec2 uv = (floor(v_uv * grid) + 0.5) / grid;
  return texture2D(u_tex, uv);
}`,
  },
]
