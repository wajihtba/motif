// Marketing full-scene shaders — built to sell a product/offer (spotlight,
// god rays, bokeh, sunburst). GLSL main() bodies are byte-identical to the
// legacy "Marketing pack" section; the shared prelude is prepended by the
// scene stage.

import type { SceneShaderDef } from "../core/types"

export const marketing: SceneShaderDef[] = [
  // Spotlight — radial focus that draws the eye to the centre product.
  {
    kind: "scene-shader",
    id: "spotlight",
    name: "Spotlight",
    group: "Marketing",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_tex, uv).rgb;
  float d = length((uv - 0.5) * vec2(1.1, 1.0));
  float spot = smoothstep(0.78, 0.15, d);
  col *= mix(0.32, 1.16, spot);
  col += spot * 0.04;          // subtle warm lift in the pool of light
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // God rays — volumetric light shafts from a top light source over highlights.
  {
    kind: "scene-shader",
    id: "godrays",
    name: "God rays",
    group: "Marketing",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_tex, uv).rgb;
  vec2 src = vec2(0.5, 0.12);
  vec2 stp = (src - uv) / 24.0;
  vec2 p = uv;
  vec3 ray = vec3(0.0); float decay = 1.0;
  for (int i = 0; i < 24; i++) {
    p += stp;
    vec3 s = texture2D(u_tex, p).rgb;
    ray += s * max(0.0, lumc(s) - 0.65) * decay;
    decay *= 0.92;
  }
  col += ray / 24.0 * 3.2 * vec3(1.0, 0.95, 0.82);
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // Bokeh — soft drifting light orbs (festive / luxury / holiday sale).
  {
    kind: "scene-shader",
    id: "bokeh",
    name: "Bokeh",
    group: "Marketing",
    animated: true,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_tex, uv).rgb;
  float t = u_time * 0.05;
  float aspect = u_res.x / u_res.y;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 seed = vec2(hashS(vec2(fi, 1.0)), hashS(vec2(fi, 2.0)));
    vec2 c = vec2(fract(seed.x + t * (0.2 + seed.y * 0.5)),
                  fract(seed.y - t * (0.15 + seed.x * 0.4)));
    float r = mix(0.02, 0.08, hashS(vec2(fi, 3.0)));
    vec2 d = (uv - c); d.x *= aspect;
    float g = smoothstep(r, 0.0, length(d));
    vec3 tint = hsv2rgb(vec3(fract(seed.x + seed.y), 0.35, 1.0));
    glow += g * g * tint * mix(0.3, 0.8, hashS(vec2(fi, 4.0)));
  }
  gl_FragColor = vec4(col + glow * 0.6, 1.0);
}`,
  },

  // Sunburst — slow rotating retro sale rays as a soft light overlay.
  {
    kind: "scene-shader",
    id: "sunburst",
    name: "Sunburst",
    group: "Marketing",
    animated: true,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_tex, uv).rgb;
  vec2 p = uv - 0.5;
  float a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * sin(a * 12.0 + u_time * 0.3), 3.0);
  float vig = smoothstep(0.9, 0.1, length(p));
  col += rays * vig * 0.13 * vec3(1.0, 0.9, 0.6);
  gl_FragColor = vec4(col, 1.0);
}`,
  },
]
