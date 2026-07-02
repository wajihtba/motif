// Shared GLSL prelude for the full-scene shader effects (ported byte-for-byte
// from the legacy effects/shaders.ts `HEAD`). It declares the uniforms every
// scene shader reads (u_tex / u_res / u_time / u_pointer) plus the small set of
// shared helpers (hash, luminance, hsv→rgb). The scene-shader stage prepends
// this to each effect's `void main()` body before compiling.

export const SCENE_HEAD = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
float hashS(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lumc(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`
