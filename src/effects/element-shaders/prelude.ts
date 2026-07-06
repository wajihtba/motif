// Shared GLSL for the per-element shader effects (originally ported from the
// legacy effects/elementShader.ts). The element prelude declares the uniforms +
// noise / SDF helpers available to every effect's fx(); the tail runs fx() and
// applies the optional content-mask clip. P(i) reads param i, keeping the GLSL
// readable while mapping cleanly onto the u_p[8] uniform array. Color params
// arrive as packed 0xRRGGBB floats — decode with up_rgb().

// Shared GLSL prelude: uniforms + hash / value-noise / fbm + a rounded-box SDF,
// available to every effect's fx().
export const EL_PRELUDE = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;   // the element, isolated (rgba, straight alpha)
uniform sampler2D u_back;  // the scene behind the element
uniform vec2 u_res;        // element size in device px
uniform float u_time;
uniform float u_p[8];
uniform float u_mask;      // 1 = clip the effect to the element's content shape

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 up_rgb(float c){ float r = floor(c / 65536.0); float g = floor(mod(c, 65536.0) / 256.0); float b = mod(c, 256.0); return vec3(r, g, b) / 255.0; }
vec2 hash22(vec2 p){ float n = sin(dot(p, vec2(41.0, 289.0))); return fract(vec2(262144.0, 32768.0) * n); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.0; a *= 0.5; } return v; }
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
float lumc(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
`

// Shared entry point: run the effect, then mask to the original content alpha
// (PNG / shape / text silhouette) when requested.
export const EL_TAIL = `
void main(){
  vec4 c = fx();
  c.a *= mix(1.0, texture2D(u_tex, v_uv).a, u_mask);
  gl_FragColor = c;
}
`

// p(i) reads param i; keeps the shaders readable.
export const P = (i: number) => `u_p[${i}]`
