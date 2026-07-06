// Shared GLSL prelude for the full-scene shader effects (originally ported
// from the legacy effects/shaders.ts `HEAD`). It declares the uniforms every
// scene shader reads (u_tex / u_res / u_time / u_pointer / u_p params) plus
// the small set of shared helpers (hash, luminance, hsv→rgb). The
// scene-shader stage prepends this to each effect's `void main()` body before
// compiling. u_p carries the layer's packed params (registry order) so scene
// shaders are tunable like element shaders; unused uniforms compile away.

export const SCENE_HEAD = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_p[8];
float hashS(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 up_rgb(float c){ float r = floor(c / 65536.0); float g = floor(mod(c, 65536.0) / 256.0); float b = mod(c, 256.0); return vec3(r, g, b) / 255.0; }
float lumc(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`
