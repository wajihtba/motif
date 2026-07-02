// The GPU-resident effect pipeline (docs/plan/02-performance.md §2): ONE
// shared WebGL2 context, a program cache keyed by effect id (+ frag hash for
// custom GLSL), and a ping-pong FBO pair so effect CHAINS never leave the
// GPU. Inputs upload via texImage2D from 2D canvases; the only readback is
// the compositor's final drawImage of this pipeline's canvas — never
// getImageData.
//
// Orientation invariant: fragment code assumes v_uv.y = 0 is the visual TOP
// (v1 convention, kept byte-compatible). Canvas uploads are stored top-first
// (texel v=0 = top). Intermediate FBO passes render UNFLIPPED so the buffer
// stays top-first; only the final present to this canvas flips (u_flip=1) so
// the displayed/drawImage'd result is upright.

import type {
  ElementShaderDef,
  PixelDef,
  SceneShaderDef,
} from "../../effects/core/types"
import { EL_PRELUDE, EL_TAIL } from "../../effects/element-shaders/prelude"
import { SCENE_HEAD } from "../../effects/scene-shaders/prelude"

const VERT = `
attribute vec2 a_pos;
uniform float u_flip;
varying vec2 v_uv;
void main(){
  vec2 uv = (a_pos + 1.0) * 0.5;
  v_uv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, u_flip));
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const TRI = new Float32Array([-1, -1, 3, -1, -1, 3])

interface ProgramInfo {
  program: WebGLProgram
  aPos: number
  uFlip: WebGLUniformLocation | null
  uTex: WebGLUniformLocation | null
  uBack: WebGLUniformLocation | null
  uRes: WebGLUniformLocation | null
  uTime: WebGLUniformLocation | null
  uP: WebGLUniformLocation | null
  uMask: WebGLUniformLocation | null
  uPointer: WebGLUniformLocation | null
}

interface Target {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

/** One layer of an element/pixel chain, fully resolved by the compositor. */
export interface ChainLayer {
  def: ElementShaderDef | PixelDef
  params: Float32Array
  time: number
  masked: boolean
  frag?: string
}

export interface SceneLayer {
  def: SceneShaderDef
  time: number
  pointer: [number, number]
}

export class GlPipeline {
  readonly canvas = document.createElement("canvas")
  private gl: WebGL2RenderingContext
  private programs = new Map<string, ProgramInfo>()
  private texSrc!: WebGLTexture
  private texBack!: WebGLTexture
  private buffer!: WebGLBuffer
  private targets: [Target | null, Target | null] = [null, null]

  constructor() {
    const gl = this.canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      alpha: true,
      antialias: false,
      depth: false,
    })
    if (!gl) throw new Error("WebGL2 unavailable")
    this.gl = gl
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault())
    this.canvas.addEventListener("webglcontextrestored", () => this.initGL())
    this.initGL()
  }

  private initGL(): void {
    const gl = this.gl
    this.programs.clear()
    this.targets = [null, null]
    this.texSrc = this.makeTex()
    this.texBack = this.makeTex()
    this.buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, TRI, gl.STATIC_DRAW)
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return tex
  }

  private target(i: 0 | 1, w: number, h: number): Target {
    const gl = this.gl
    let t = this.targets[i]
    if (t && t.w === w && t.h === h) return t
    if (t) {
      gl.deleteFramebuffer(t.fbo)
      gl.deleteTexture(t.tex)
    }
    const tex = this.makeTex()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    )
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    t = { fbo, tex, w, h }
    this.targets[i] = t
    return t
  }

  private program(key: string, fragSource: string): ProgramInfo {
    let info = this.programs.get(key)
    if (info) return info
    const gl = this.gl
    const program = link(gl, VERT, fragSource)
    info = {
      program,
      aPos: gl.getAttribLocation(program, "a_pos"),
      uFlip: gl.getUniformLocation(program, "u_flip"),
      uTex: gl.getUniformLocation(program, "u_tex"),
      uBack: gl.getUniformLocation(program, "u_back"),
      uRes: gl.getUniformLocation(program, "u_res"),
      uTime: gl.getUniformLocation(program, "u_time"),
      uP: gl.getUniformLocation(program, "u_p[0]"),
      uMask: gl.getUniformLocation(program, "u_mask"),
      uPointer: gl.getUniformLocation(program, "u_pointer"),
    }
    this.programs.set(key, info)
    return info
  }

  /** Sandbox-compile a GLSL body (the normalize gate's escape-hatch check).
   *  Returns null when it compiles; the shader info log otherwise — returned
   *  to the agent so it can fix its GLSL in the same turn. */
  compileCheck(kind: "element" | "scene", fragBody: string): string | null {
    const gl = this.gl
    const src =
      kind === "element"
        ? EL_PRELUDE + fragBody + EL_TAIL
        : SCENE_HEAD + "\n" + fragBody
    const sh = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) as boolean
    const log = ok ? null : gl.getShaderInfoLog(sh) || "compile failed"
    gl.deleteShader(sh)
    return log
  }

  /** Run an element/pixel chain over a unit's pixels. `back` is the frame
   *  accumulated SO FAR under the unit's box — the in-frame backdrop that
   *  kills v1's two-frame handshake. Returns this pipeline's canvas (upright,
   *  ready to drawImage) or null on context loss / empty chain. */
  runChain(
    src: TexImageSource,
    back: TexImageSource | null,
    layers: ChainLayer[],
    w: number,
    h: number
  ): HTMLCanvasElement | null {
    const gl = this.gl
    if (!layers.length || gl.isContextLost() || w < 1 || h < 1) return null
    this.ensureCanvas(w, h)

    // Upload inputs (top-first, matching the fragment convention).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texBack)
    if (back) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, back)
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(4)
      )
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texSrc)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)

    let sourceTex = this.texSrc
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const last = i === layers.length - 1
      const key = layer.frag
        ? `el:${layer.def.id}:${hashStr(layer.frag)}`
        : `el:${layer.def.id}`
      let p: ProgramInfo
      try {
        p = this.program(
          key,
          EL_PRELUDE + (layer.frag ?? layer.def.frag) + EL_TAIL
        )
      } catch {
        continue // bad custom shader — skip the layer, keep the frame alive
      }

      const target = last ? null : this.target((i % 2) as 0 | 1, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null)
      gl.viewport(0, 0, w, h)
      gl.useProgram(p.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.enableVertexAttribArray(p.aPos)
      gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sourceTex)
      gl.uniform1i(p.uTex, 0)
      gl.uniform1i(p.uBack, 1)
      if (p.uFlip) gl.uniform1f(p.uFlip, last ? 1 : 0)
      if (p.uRes) gl.uniform2f(p.uRes, w, h)
      if (p.uTime) gl.uniform1f(p.uTime, layer.time)
      if (p.uP) gl.uniform1fv(p.uP, layer.params)
      if (p.uMask) gl.uniform1f(p.uMask, layer.masked ? 1 : 0)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (target) sourceTex = target.tex
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return this.canvas
  }

  /** Run the full-frame scene-shader chain over the composited frame. */
  runSceneChain(
    frame: TexImageSource,
    layers: SceneLayer[],
    w: number,
    h: number
  ): HTMLCanvasElement | null {
    const gl = this.gl
    if (!layers.length || gl.isContextLost() || w < 1 || h < 1) return null
    this.ensureCanvas(w, h)

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texSrc)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)

    let sourceTex = this.texSrc
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const last = i === layers.length - 1
      let p: ProgramInfo
      try {
        p = this.program(
          `scene:${layer.def.id}`,
          SCENE_HEAD + "\n" + layer.def.frag
        )
      } catch {
        continue
      }
      const target = last ? null : this.target((i % 2) as 0 | 1, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null)
      gl.viewport(0, 0, w, h)
      gl.useProgram(p.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.enableVertexAttribArray(p.aPos)
      gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sourceTex)
      gl.uniform1i(p.uTex, 0)
      if (p.uFlip) gl.uniform1f(p.uFlip, last ? 1 : 0)
      if (p.uRes) gl.uniform2f(p.uRes, w, h)
      if (p.uTime) gl.uniform1f(p.uTime, layer.time)
      if (p.uPointer)
        gl.uniform2f(p.uPointer, layer.pointer[0], layer.pointer[1])

      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (target) sourceTex = target.tex
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return this.canvas
  }

  private ensureCanvas(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error("compile failed: " + log)
  }
  return sh
}

function link(
  gl: WebGL2RenderingContext,
  vsrc: string,
  fsrc: string
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc)
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link failed: " + gl.getProgramInfoLog(prog))
  }
  return prog
}

/** Small stable hash for caching compiled custom-shader programs by source. */
export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}
