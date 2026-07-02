import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const glass: ElementShaderDef[] = [
  // ── Liquid glass — Apple-style refractive lens over the backdrop ──────────
  {
    kind: "element-shader",
    id: "liquidGlass",
    name: "Liquid glass",
    group: "Glass",
    animated: true,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "refraction",
        label: "Refraction",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.6,
      },
      {
        key: "edge",
        label: "Edge bend",
        min: 0.02,
        max: 0.5,
        step: 0.01,
        def: 0.22,
      },
      { key: "glare", label: "Glare", min: 0, max: 1, step: 0.01, def: 0.55 },
      {
        key: "tint",
        label: "Frost tint",
        min: 0,
        max: 0.6,
        step: 0.01,
        def: 0.12,
      },
      {
        key: "radius",
        label: "Corner",
        min: 0,
        max: 0.5,
        step: 0.01,
        def: 0.35,
      },
    ],
    // In box mode the refraction normal/rim come from the rounded-rect SDF; in
    // mask mode they come from the content's alpha field, so each glyph / shape
    // edge becomes its own glass lens. The shared TAIL applies the content clip.
    frag: `
vec3 blurBack(vec2 uv, float r){
  vec3 s = texture2D(u_back, uv).rgb * 0.38;
  s += texture2D(u_back, uv + vec2(r, 0.0)).rgb * 0.155;
  s += texture2D(u_back, uv - vec2(r, 0.0)).rgb * 0.155;
  s += texture2D(u_back, uv + vec2(0.0, r)).rgb * 0.155;
  s += texture2D(u_back, uv - vec2(0.0, r)).rgb * 0.155;
  return s;
}
vec4 fx(){
  float refraction = ${P(0)}, edgeW = ${P(1)}, glare = ${P(2)}, tint = ${P(3)}, radius = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  // whole-box lens: rounded-rect SDF normal / rim / coverage
  vec2 center = u_res * 0.5;
  vec2 hb = center - 1.0;
  vec2 p = v_uv * u_res - center;
  float minHalf = min(hb.x, hb.y);
  float rad = radius * minHalf;
  float d = sdRound(p, hb, rad);
  float e = 1.5;
  vec2 nBox = normalize(vec2(
    sdRound(p + vec2(e, 0.0), hb, rad) - sdRound(p - vec2(e, 0.0), hb, rad),
    sdRound(p + vec2(0.0, e), hb, rad) - sdRound(p - vec2(0.0, e), hb, rad)) + 1e-5);
  float edgeBox = 1.0 - smoothstep(0.0, edgeW * minHalf, -d);
  float maskBox = 1.0 - smoothstep(-1.0, 1.0, d);
  // per-content lens: normal / rim from the alpha field (glyph / PNG / shape)
  vec2 px = 1.0 / u_res;
  float aL = texture2D(u_tex, v_uv - vec2(px.x, 0.0)).a;
  float aR = texture2D(u_tex, v_uv + vec2(px.x, 0.0)).a;
  float aD = texture2D(u_tex, v_uv - vec2(0.0, px.y)).a;
  float aU = texture2D(u_tex, v_uv + vec2(0.0, px.y)).a;
  vec2 nGlyph = normalize(vec2(aL - aR, aD - aU) + 1e-5);
  float edgeGlyph = clamp(length(vec2(aR - aL, aU - aD)) * 3.0, 0.0, 1.0);
  vec2 n = mix(nBox, nGlyph, u_mask);
  float edge = mix(edgeBox, edgeGlyph, u_mask);
  vec2 buv = v_uv + n * edge * refraction * 0.16;
  vec3 bg = blurBack(buv, 1.6 / min(u_res.x, u_res.y) + edge * 0.01);
  bg = mix(bg, vec3(1.0), tint * 0.5);
  bg += edge * 0.06;
  float sheen = pow(edge, 1.6) * max(0.0, dot(n, normalize(vec2(-0.6, -0.8))));
  float band = smoothstep(0.45, 0.5, abs(fract((v_uv.x + v_uv.y) * 0.5 - u_time * 0.05) - 0.5));
  bg += glare * (sheen * 0.7 + edge * band * 0.15);
  // box: glass panel with text on top. mask: content IS glass (keep a touch of
  // the original colour for legibility). Coverage is maskBox; TAIL clips to el.a.
  vec3 col = mix(bg, el.rgb, el.a * (1.0 - u_mask * 0.82));
  return vec4(col, maskBox);
}`,
  },

  // ── Frosted / neuglass — heavy blur + neumorphic relief ──────────────────
  {
    kind: "element-shader",
    id: "frostedGlass",
    name: "Neo-glass",
    group: "Glass",
    animated: false,
    animateByDefault: false,
    maskable: true,
    params: [
      { key: "blur", label: "Frost", min: 0.2, max: 3, step: 0.05, def: 1.3 },
      { key: "tint", label: "Tint", min: 0, max: 0.7, step: 0.01, def: 0.18 },
      { key: "relief", label: "Relief", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "sat",
        label: "Saturation",
        min: 0,
        max: 1.6,
        step: 0.01,
        def: 1.0,
      },
      { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01, def: 0.25 },
    ],
    frag: `
vec4 fx(){
  float blur = ${P(0)}, tint = ${P(1)}, relief = ${P(2)}, sat = ${P(3)}, grain = ${P(4)};
  float r = blur * 0.016;
  vec3 bg = vec3(0.0); float tot = 0.0;
  for (int i = -2; i <= 2; i++){
    for (int j = -2; j <= 2; j++){
      vec2 o = vec2(float(i), float(j)) * r;
      float w = 1.0 - 0.12 * float(i * i + j * j);
      bg += texture2D(u_back, v_uv + o).rgb * w; tot += w;
    }
  }
  bg /= tot;
  float l = dot(bg, vec3(0.299, 0.587, 0.114));
  bg = mix(vec3(l), bg, sat);          // saturation
  bg = mix(bg, vec3(1.0), tint);       // white frost
  // neumorphic relief (box-only — fades out when masking to content)
  vec2 q = v_uv - 0.5;
  float edgeDist = 0.5 - max(abs(q.x), abs(q.y));
  float ring = smoothstep(0.0, 0.05, edgeDist);
  bg += (-(q.x + q.y)) * relief * 0.5 * (1.0 - u_mask);
  bg += (1.0 - ring) * relief * 0.18 * (1.0 - u_mask);
  bg += (hash21(v_uv * u_res) - 0.5) * grain * 0.09;
  vec4 el = texture2D(u_tex, v_uv);
  vec3 col = mix(bg, el.rgb, el.a * (1.0 - u_mask * 0.82));
  return vec4(col, 1.0);               // box fill; TAIL clips to content when on
}`,
  },
]
