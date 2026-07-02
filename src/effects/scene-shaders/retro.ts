// Retro full-scene shaders — analogue / hardware-display looks (CRT, VHS, dot
// screens, LED matrix, ordered dither). GLSL main() bodies are byte-identical to
// the legacy catalogue; the shared prelude is prepended by the scene stage.

import type { SceneShaderDef } from "../core/types"

export const retro: SceneShaderDef[] = [
  // ── Retro CRT — barrel distortion + scanlines + vignette ──────────────────
  {
    kind: "scene-shader",
    id: "crt",
    name: "CRT",
    group: "Retro",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 + 0.12 * dot(c, c));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  vec3 col = texture2D(u_tex, uv).rgb;
  float scan = sin(uv.y * u_res.y * 1.5) * 0.06;
  col -= scan;
  col *= 1.0 - 0.3 * dot(c, c);
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // ── Halftone — newsprint dot screen ───────────────────────────────────────
  {
    kind: "scene-shader",
    id: "halftone",
    name: "Halftone",
    group: "Retro",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec3 col = texture2D(u_tex, v_uv).rgb;
  float lum = lumc(col);
  float scale = 6.0;
  vec2 p = v_uv * u_res / scale;
  vec2 grid = fract(p) - 0.5;
  float d = length(grid);
  float dot_ = step(d, (1.0 - lum) * 0.6);
  vec3 ink = mix(vec3(0.05,0.05,0.1), col, 0.25);
  gl_FragColor = vec4(mix(vec3(0.96), ink, dot_), 1.0);
}`,
  },

  // ── ASCII — luminance quantized to glyph masks ────────────────────────────
  {
    kind: "scene-shader",
    id: "ascii",
    name: "ASCII",
    group: "Retro",
    animated: false,
    pointer: false,
    params: [],
    frag: `float glyph(float lum, vec2 p) {
  float b = 0.0;
  if (lum > 0.2) { b += step(abs(p.y - 0.5), 0.06); }
  if (lum > 0.4) { b += step(abs(p.x - 0.5), 0.06); }
  if (lum > 0.6) { b += step(abs(abs(p.x-0.5)-abs(p.y-0.5)), 0.07); }
  if (lum > 0.85){ b += step(length(p-0.5), 0.4); }
  return clamp(b, 0.0, 1.0);
}
void main() {
  float cell = 8.0;
  vec2 grid = floor(v_uv * u_res / cell) * cell / u_res;
  vec3 col = texture2D(u_tex, grid + (cell * 0.5) / u_res).rgb;
  float lum = lumc(col);
  vec2 p = fract(v_uv * u_res / cell);
  float g = glyph(lum, p);
  vec3 ink = mix(vec3(0.02,0.05,0.03), vec3(0.4,1.0,0.5), lum);
  gl_FragColor = vec4(ink * g, 1.0);
}`,
  },

  // ── VHS — wavy tape tracking, chroma bleed, scanlines, static (animated) ──
  {
    kind: "scene-shader",
    id: "vhs",
    name: "VHS",
    group: "Retro",
    animated: true,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  float t = u_time;
  // tape warble + fine head-switching jitter
  uv.x += sin(uv.y * 8.0 + t * 2.0) * 0.0016 + sin(uv.y * 140.0 - t * 6.0) * 0.0009;
  // occasional tracking band that tears a row sideways and darkens it
  float band = step(0.99, hashS(vec2(floor((uv.y + t * 0.25) * 16.0), floor(t * 3.0))));
  uv.x += band * 0.03;
  float sh = 0.005;
  float r = texture2D(u_tex, uv + vec2(sh, 0.0)).r;
  float g = texture2D(u_tex, uv).g;
  float b = texture2D(u_tex, uv - vec2(sh, 0.0)).b;
  vec3 col = vec3(r, g, b);
  col *= 0.85 + 0.15 * sin(uv.y * u_res.y * 1.1);          // scanlines
  col += (hashS(uv * u_res + t) - 0.5) * 0.09;             // static
  col *= 1.0 - band * 0.35;
  col *= 1.0 - 0.28 * dot(uv - 0.5, uv - 0.5);             // vignette
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // ── Dot matrix — round LED display cells ──────────────────────────────────
  {
    kind: "scene-shader",
    id: "dotmatrix",
    name: "LED",
    group: "Retro",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  float cell = 7.0;
  vec2 g = floor(v_uv * u_res / cell) * cell / u_res;
  vec3 col = texture2D(u_tex, g + (cell * 0.5) / u_res).rgb;
  vec2 f = fract(v_uv * u_res / cell) - 0.5;
  float d = 1.0 - smoothstep(0.24, 0.46, length(f));
  gl_FragColor = vec4(col * d * 1.18, 1.0);
}`,
  },

  // Dithering — ordered Bayer 1-bit dither of the whole composition (the
  // paper-design hero look applied image-wide: ink on phosphor paper).
  {
    kind: "scene-shader",
    id: "dithering",
    name: "Dither",
    group: "Retro",
    animated: false,
    pointer: false,
    params: [],
    frag: `float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
void main() {
  vec3 src = texture2D(u_tex, v_uv).rgb;
  float lum = lumc(src);
  vec2 bp = floor(v_uv * u_res / 2.0);
  float th = bayer2(0.5 * bp) * 0.25 + bayer2(bp);   // 4x4 ordered matrix
  float q = step(th, lum);
  vec3 ink = vec3(0.04, 0.05, 0.08);
  vec3 paper = src * 0.4 + vec3(0.85, 0.88, 0.96) * 0.7;
  gl_FragColor = vec4(mix(ink, paper, q), 1.0);
}`,
  },
]
