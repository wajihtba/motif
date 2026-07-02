// Stylize full-scene shaders — colour grades, lens distortions, and graphic
// abstractions over the whole composite. GLSL main() bodies are byte-identical
// to the legacy catalogue; the shared prelude is prepended by the scene stage.

import type { SceneShaderDef } from "../core/types"

export const stylize: SceneShaderDef[] = [
  // ── Chromatic aberration — animated RGB lens split ────────────────────────
  {
    kind: "scene-shader",
    id: "chromatic",
    name: "Chroma",
    group: "Stylize",
    animated: true,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 dir = v_uv - 0.5;
  float amt = 0.006 + 0.004 * sin(u_time);
  float r = texture2D(u_tex, v_uv - dir * amt).r;
  float g = texture2D(u_tex, v_uv).g;
  float b = texture2D(u_tex, v_uv + dir * amt).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}`,
  },

  // ── Bulge — cursor-following fisheye lens ─────────────────────────────────
  {
    kind: "scene-shader",
    id: "bulge",
    name: "Bulge",
    group: "Stylize",
    animated: false,
    pointer: true,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec2 center = u_pointer;
  vec2 d = uv - center;
  float dist = length(d);
  float radius = 0.28;
  float strength = 0.6;
  if (dist < radius) {
    float p = dist / radius;
    float f = mix(1.0, p * p, strength);
    uv = center + d * f;
  }
  gl_FragColor = texture2D(u_tex, uv);
}`,
  },

  // ── Bloom — dreamy bright-pass glow bleed ─────────────────────────────────
  {
    kind: "scene-shader",
    id: "bloom",
    name: "Bloom",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec3 base = texture2D(u_tex, v_uv).rgb;
  vec3 sum = vec3(0.0); float tot = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      vec2 o = vec2(float(i), float(j)) / u_res * 3.0;
      vec3 s = texture2D(u_tex, v_uv + o).rgb;
      float bright = max(0.0, lumc(s) - 0.6);
      float w = 1.0 / (1.0 + float(i * i + j * j));
      sum += s * bright * w; tot += w;
    }
  }
  gl_FragColor = vec4(base + (sum / tot) * 1.7, 1.0);
}`,
  },

  // ── Cinematic — teal/orange grade + grain + vignette (static grain) ───────
  {
    kind: "scene-shader",
    id: "cinematic",
    name: "Cinematic",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_tex, uv).rgb;
  float l = lumc(col);
  col = mix(col, col * vec3(1.06, 1.02, 0.90), smoothstep(0.5, 1.0, l)); // warm highlights
  col = mix(col, col * vec3(0.90, 0.98, 1.10), smoothstep(0.5, 0.0, l)); // teal shadows
  col = (col - 0.5) * 1.1 + 0.5;                                          // contrast
  col += (hashS(uv * u_res) - 0.5) * 0.05;                                // static grain
  float v = smoothstep(0.95, 0.25, length((uv - 0.5) * vec2(1.1, 1.0)));
  col *= mix(0.5, 1.0, v);
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // ── Duotone — luminance mapped to a two-tone brand gradient ───────────────
  {
    kind: "scene-shader",
    id: "duotone",
    name: "Duotone",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  float l = lumc(texture2D(u_tex, v_uv).rgb);
  vec3 lo = vec3(0.10, 0.06, 0.32);   // deep indigo shadows
  vec3 hi = vec3(1.00, 0.42, 0.62);   // hot-pink highlights
  gl_FragColor = vec4(mix(lo, hi, smoothstep(0.05, 0.95, l)), 1.0);
}`,
  },

  // ── Kaleidoscope — mirrored radial segments ───────────────────────────────
  {
    kind: "scene-shader",
    id: "kaleidoscope",
    name: "Kaleido",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 p = v_uv - 0.5;
  float a = atan(p.y, p.x);
  float r = length(p);
  float seg = 6.2831853 / 8.0;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  vec2 uv = clamp(0.5 + vec2(cos(a), sin(a)) * r, 0.0, 1.0);
  gl_FragColor = texture2D(u_tex, uv);
}`,
  },

  // ── Mosaic — clean blocky pixelation ──────────────────────────────────────
  {
    kind: "scene-shader",
    id: "mosaic",
    name: "Mosaic",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  float cell = 10.0;
  vec2 uv = (floor(v_uv * u_res / cell) + 0.5) * cell / u_res;
  gl_FragColor = vec4(texture2D(u_tex, uv).rgb, 1.0);
}`,
  },

  // ── Posterize — banded poster colour quantization ─────────────────────────
  {
    kind: "scene-shader",
    id: "posterize",
    name: "Poster",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec3 col = texture2D(u_tex, v_uv).rgb;
  float n = 5.0;
  col = floor(col * n) / (n - 1.0);
  float l = lumc(col);
  col = mix(vec3(l), col, 1.3);   // pop saturation
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
  },

  // ── Edges — Sobel ink outline over the image ──────────────────────────────
  {
    kind: "scene-shader",
    id: "edges",
    name: "Edges",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 px = 1.0 / u_res;
  float tl = lumc(texture2D(u_tex, v_uv + px * vec2(-1.0, -1.0)).rgb);
  float l  = lumc(texture2D(u_tex, v_uv + px * vec2(-1.0,  0.0)).rgb);
  float bl = lumc(texture2D(u_tex, v_uv + px * vec2(-1.0,  1.0)).rgb);
  float tr = lumc(texture2D(u_tex, v_uv + px * vec2( 1.0, -1.0)).rgb);
  float r  = lumc(texture2D(u_tex, v_uv + px * vec2( 1.0,  0.0)).rgb);
  float br = lumc(texture2D(u_tex, v_uv + px * vec2( 1.0,  1.0)).rgb);
  float t  = lumc(texture2D(u_tex, v_uv + px * vec2( 0.0, -1.0)).rgb);
  float b  = lumc(texture2D(u_tex, v_uv + px * vec2( 0.0,  1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = clamp(length(vec2(gx, gy)), 0.0, 1.0);
  vec3 col = texture2D(u_tex, v_uv).rgb;
  gl_FragColor = vec4(mix(col, vec3(0.04), e), 1.0);
}`,
  },

  // Zoom blur — radial motion blur with a sharp centre (focus-pull / energy).
  {
    kind: "scene-shader",
    id: "zoomblur",
    name: "Zoom blur",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  vec2 uv = v_uv;
  vec2 c = uv - 0.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float scale = 1.0 - float(i) / 15.0 * 0.12;
    col += texture2D(u_tex, 0.5 + c * scale).rgb;
  }
  col /= 16.0;
  float sharp = smoothstep(0.42, 0.0, length(c));
  gl_FragColor = vec4(mix(col, texture2D(u_tex, uv).rgb, sharp), 1.0);
}`,
  },

  // Glitch — full-scene datamosh: row tearing, RGB split, scan static (animated).
  {
    kind: "scene-shader",
    id: "glitchScene",
    name: "Glitch",
    group: "Stylize",
    animated: true,
    pointer: false,
    params: [],
    frag: `void main() {
  float t = u_time;
  vec2 uv = v_uv;
  float row = floor(uv.y * 40.0);
  float g = hashS(vec2(row, floor(t * 8.0)));
  uv.x = fract(uv.x + (g - 0.5) * 0.1 * step(0.6, g));
  float s = 0.006 * step(0.5, hashS(vec2(floor(t * 5.0), 1.0)));
  vec3 col = vec3(texture2D(u_tex, uv + vec2(s, 0.0)).r,
                  texture2D(u_tex, uv).g,
                  texture2D(u_tex, uv - vec2(s, 0.0)).b);
  col = mix(col, vec3(1.0), step(0.99, hashS(vec2(row, floor(t * 30.0)))) * 0.4);
  gl_FragColor = vec4(col, 1.0);
}`,
  },

  // Thermal — infrared heatmap by luminance (fun / tech / fitness).
  {
    kind: "scene-shader",
    id: "thermal",
    name: "Thermal",
    group: "Stylize",
    animated: false,
    pointer: false,
    params: [],
    frag: `void main() {
  float l = lumc(texture2D(u_tex, v_uv).rgb);
  gl_FragColor = vec4(hsv2rgb(vec3((1.0 - l) * 0.7, 1.0, l * 0.6 + 0.4)), 1.0);
}`,
  },
]
