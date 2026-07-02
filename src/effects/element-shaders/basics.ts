import type { ElementShaderDef } from "../core/types"

export const basics: ElementShaderDef[] = [
  // The "no effect" sentinel — passes the element through untouched.
  {
    kind: "element-shader",
    id: "none",
    name: "None",
    group: "Basics",
    animated: false,
    animateByDefault: false,
    maskable: false,
    params: [],
    frag: `vec4 fx(){ return texture2D(u_tex, v_uv); }`,
  },
  // Code escape hatch: the agent (or a power user) supplies the fx() body on the
  // EffectLayer.frag; the engine compiles it with the shared element prelude. The
  // `frag` here is only the fallback when no custom code is provided. Generic
  // params P(0..2) are wired so authored shaders have knobs the UI can drive.
  {
    kind: "element-shader",
    id: "custom",
    name: "Custom GLSL",
    group: "Basics",
    blurb:
      "Write your own fx() fragment. Reads u_tex/u_back/u_time/u_p[]; returns vec4.",
    animated: true,
    animateByDefault: false,
    maskable: true,
    params: [
      {
        key: "p0",
        label: "Param 0 (intensity)",
        min: 0,
        max: 2,
        step: 0.01,
        def: 1,
      },
      {
        key: "p1",
        label: "Param 1 (scale)",
        min: 0,
        max: 20,
        step: 0.1,
        def: 4,
      },
      {
        key: "p2",
        label: "Param 2 (speed)",
        min: 0,
        max: 4,
        step: 0.01,
        def: 1,
      },
    ],
    frag: `vec4 fx(){ return texture2D(u_tex, v_uv); }`,
  },
]
