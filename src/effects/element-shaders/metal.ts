import type { ElementShaderDef } from "../core/types"
import { P } from "./prelude"

export const metal: ElementShaderDef[] = [
  // ── Chrome — Y2K liquid-metal sheen from the content's alpha field ────────
  {
    kind: "element-shader",
    id: "chrome",
    name: "Chrome",
    group: "Metal & Foil",
    animated: true,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "sharp",
        label: "Sharpness",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.5,
      },
      { key: "hue", label: "Tint", min: 0, max: 1, step: 0.01, def: 0.58 },
      {
        key: "contrast",
        label: "Contrast",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.6,
      },
      { key: "flow", label: "Flow", min: 0, max: 3, step: 0.05, def: 0.6 },
      { key: "shine", label: "Hotspot", min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float sharp = ${P(0)}, hue = ${P(1)}, contrast = ${P(2)}, flow = ${P(3)}, shine = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 px = 1.0 / u_res;
  float aL = texture2D(u_tex, v_uv - vec2(px.x, 0.0)).a;
  float aR = texture2D(u_tex, v_uv + vec2(px.x, 0.0)).a;
  float aD = texture2D(u_tex, v_uv - vec2(0.0, px.y)).a;
  float aU = texture2D(u_tex, v_uv + vec2(0.0, px.y)).a;
  vec2 n = vec2(aL - aR, aD - aU);
  // reflective horizon: stacked light/dark metal bands bent by the surface normal
  float env = v_uv.y * 2.0 - 1.0 + n.y * mix(2.0, 9.0, sharp) + sin(u_time * flow) * 0.12;
  float metal = pow(0.5 + 0.5 * sin(env * 4.7), mix(1.0, 3.0, contrast));
  vec3 tint = hsv2rgb(vec3(hue, 0.35, 1.0));
  vec3 col = mix(vec3(0.07, 0.08, 0.11), tint, metal);
  col += pow(metal, 8.0) * shine;                 // chrome hotspot
  return vec4(col, el.a);
}`,
  },

  // ── Iridescent — holographic thin-film foil shimmer ──────────────────────
  {
    kind: "element-shader",
    id: "iridescent",
    name: "Holo foil",
    group: "Metal & Foil",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.85 },
      { key: "scale", label: "Bands", min: 1, max: 12, step: 0.1, def: 5.0 },
      { key: "shift", label: "Warp", min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.6 },
      {
        key: "sat",
        label: "Saturation",
        min: 0,
        max: 1.4,
        step: 0.01,
        def: 1.0,
      },
    ],
    frag: `
vec4 fx(){
  float amount = ${P(0)}, scale = ${P(1)}, shift = ${P(2)}, speed = ${P(3)}, sat = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 px = 1.0 / u_res;
  vec2 n = vec2(texture2D(u_tex, v_uv - vec2(px.x,0.0)).a - texture2D(u_tex, v_uv + vec2(px.x,0.0)).a,
                texture2D(u_tex, v_uv - vec2(0.0,px.y)).a - texture2D(u_tex, v_uv + vec2(0.0,px.y)).a);
  float phase = (v_uv.x + v_uv.y) * scale + length(n) * 9.0 + u_time * speed + dot(n, vec2(4.0)) * shift;
  vec3 iri = 0.5 + 0.5 * cos(6.2831 * (phase + vec3(0.0, 0.33, 0.67)));
  iri = mix(vec3(lumc(iri)), iri, sat);
  return vec4(mix(el.rgb, iri, amount), el.a);
}`,
  },

  // Gold foil — luxurious metallic gradient sweep over the content.
  {
    kind: "element-shader",
    id: "goldFoil",
    name: "Gold foil",
    group: "Metal & Foil",
    animated: true,
    animateByDefault: false,
    maskable: true,
    params: [
      { key: "hue", label: "Metal hue", min: 0, max: 1, step: 0.01, def: 0.12 },
      { key: "bands", label: "Bands", min: 1, max: 10, step: 0.1, def: 6.0 },
      { key: "angle", label: "Angle", min: 0, max: 1, step: 0.01, def: 0.25 },
      { key: "shine", label: "Shine", min: 0, max: 1.5, step: 0.01, def: 0.7 },
      { key: "speed", label: "Speed", min: 0, max: 3, step: 0.05, def: 0.6 },
    ],
    frag: `
vec4 fx(){
  float hue = ${P(0)}, bands = ${P(1)}, angle = ${P(2)}, shine = ${P(3)}, speed = ${P(4)};
  vec4 el = texture2D(u_tex, v_uv);
  float ang = angle * 3.14159;
  vec2 dir = vec2(cos(ang), sin(ang));
  float g = dot(v_uv - 0.5, dir) + 0.5;
  float band = 0.5 + 0.5 * sin((g * bands + u_time * speed) * 3.14159);
  vec3 foil = mix(hsv2rgb(vec3(hue, 0.8, 0.42)), hsv2rgb(vec3(hue, 0.5, 1.0)), band);
  foil += pow(band, 8.0) * shine;
  return vec4(foil, el.a);
}`,
  },

  // Liquid metal — animated diagonal chrome stripes with per-channel dispersion,
  // noise distortion and an edge "contour" that pools the metal at the shape rim.
  // (paper-design LiquidMetal: repetition / softness / shift / distortion / contour)
  {
    kind: "element-shader",
    id: "liquidMetal",
    name: "Liquid metal",
    group: "Metal & Foil",
    animated: true,
    animateByDefault: true,
    maskable: true,
    params: [
      {
        key: "repetition",
        label: "Repetition",
        min: 1,
        max: 10,
        step: 0.1,
        def: 6.0,
      },
      {
        key: "softness",
        label: "Softness",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.7,
      },
      {
        key: "dispersion",
        label: "Dispersion",
        min: -1,
        max: 1,
        step: 0.01,
        def: 0.4,
      },
      {
        key: "distortion",
        label: "Distortion",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.35,
      },
      {
        key: "contour",
        label: "Contour",
        min: 0,
        max: 1,
        step: 0.01,
        def: 0.4,
      },
      { key: "hue", label: "Tint", min: 0, max: 1, step: 0.01, def: 0.55 },
    ],
    frag: `
vec4 fx(){
  float repetition = ${P(0)}, softness = ${P(1)}, dispersion = ${P(2)}, distortion = ${P(3)}, contour = ${P(4)}, hue = ${P(5)};
  vec4 el = texture2D(u_tex, v_uv);
  vec2 px = 1.0 / u_res;
  // alpha edge field — paper feeds the shader an image whose R=edge, G=opacity;
  // here the content's own alpha gradient gives the same rim signal.
  float aL = texture2D(u_tex, v_uv - vec2(px.x,0.0)).a;
  float aR = texture2D(u_tex, v_uv + vec2(px.x,0.0)).a;
  float aD = texture2D(u_tex, v_uv - vec2(0.0,px.y)).a;
  float aU = texture2D(u_tex, v_uv + vec2(0.0,px.y)).a;
  float edge = clamp(length(vec2(aL - aR, aD - aU)) * 4.0, 0.0, 1.0);
  float t = u_time * 0.6;
  // domain-warp the stripe coordinate; contour injects extra warp into the rim
  float warp = fbm(v_uv * 3.0 + vec2(0.0, t)) - 0.5;
  float amt = distortion + contour * edge * 1.6;
  float reps = repetition * 6.2831;
  float base = (v_uv.x + v_uv.y) * reps + warp * amt * reps + t * 2.0;
  // chromatic dispersion: sample the stripe phase shifted per channel
  float d = dispersion * 1.2;
  float sR = 0.5 + 0.5 * sin(base + d);
  float sG = 0.5 + 0.5 * sin(base);
  float sB = 0.5 + 0.5 * sin(base - d);
  float sharp = mix(7.0, 1.0, softness);             // low softness = razor metal
  vec3 metal = pow(vec3(sR, sG, sB), vec3(sharp));
  metal += pow(sG, 10.0) * 0.6;                       // specular hotspot
  vec3 tint = hsv2rgb(vec3(hue, 0.45, 1.0));
  vec3 col = mix(metal, metal * tint + tint * 0.12, 0.65);
  return vec4(col, el.a);
}`,
  },
]
