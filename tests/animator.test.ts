// Animator (eval lane 1): seconds-based windows, deterministic sampling,
// the multiply/add combination rule, stagger, and the keyframe escape hatch.

import { describe, expect, it } from "vitest"
import type { Scene } from "@/scene/types"
import { compileAnimations, sampleAt } from "@/engine/animator"
import { emptyScene, node, rootNode } from "@/scene/model"

function sceneWith(animations: Scene["animations"]): Scene {
  const scene = emptyScene()
  scene.root = rootNode([
    node({ id: "a", role: "headline", html: "A" }),
    node({ id: "b", role: "badge", html: "B" }),
    node({ id: "c", role: "badge", html: "C" }),
  ])
  scene.animations = animations
  return scene
}

describe("animator", () => {
  it("samples are deterministic (same t → same numbers)", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "t1",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          preset: "float",
          loop: true,
        },
      ])
    )
    const s1 = sampleAt(compiled, 1.234, "a")
    const s2 = sampleAt(compiled, 1.234, "a")
    expect(s1).toEqual(s2)
    expect(s1).not.toBeNull()
  })

  it("entrance windows: before start = initial, after end = settled", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "t1",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          preset: "fadeIn",
          start: 1,
          params: { duration: 0.5, delay: 0 },
        },
      ])
    )
    expect(sampleAt(compiled, 0, "a")!.opacity).toBe(0) // before window
    expect(sampleAt(compiled, 0.99, "a")!.opacity).toBe(0)
    expect(sampleAt(compiled, 5, "a")!.opacity).toBe(1) // settled
    const mid = sampleAt(compiled, 1.25, "a")!.opacity
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it("loops wrap within the window", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "t1",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          preset: "fadeIn",
          duration: 2,
          loop: true,
          params: { duration: 2, delay: 0 },
        },
      ])
    )
    const s1 = sampleAt(compiled, 0.5, "a")!
    const s2 = sampleAt(compiled, 2.5, "a")! // one full loop later
    expect(s1.opacity).toBeCloseTo(s2.opacity, 10)
  })

  it("combines tracks: opacity/scale multiply, offsets add", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "k1",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          duration: 1,
          tracks: [
            {
              prop: "opacity",
              frames: [
                { t: 0, v: 0.5 },
                { t: 1, v: 0.5 },
              ],
            },
            {
              prop: "x",
              frames: [
                { t: 0, v: 10 },
                { t: 1, v: 10 },
              ],
            },
          ],
        },
        {
          id: "k2",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          duration: 1,
          tracks: [
            {
              prop: "opacity",
              frames: [
                { t: 0, v: 0.5 },
                { t: 1, v: 0.5 },
              ],
            },
            {
              prop: "x",
              frames: [
                { t: 0, v: 5 },
                { t: 1, v: 5 },
              ],
            },
          ],
        },
      ])
    )
    const s = sampleAt(compiled, 0.5, "a")!
    expect(s.opacity).toBeCloseTo(0.25)
    expect(s.x).toBeCloseTo(15)
  })

  it("multi-element targets fan out with stagger", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "t1",
          target: { type: "elements", ids: ["b", "c"] },
          enabled: true,
          preset: "fadeIn",
          stagger: 0.5,
          params: { duration: 0.4, delay: 0 },
        },
      ])
    )
    // b starts at 0, c staggers to 0.5
    expect(sampleAt(compiled, 0.45, "b")!.opacity).toBe(1)
    expect(sampleAt(compiled, 0.45, "c")!.opacity).toBe(0)
    expect(sampleAt(compiled, 1.2, "c")!.opacity).toBe(1)
  })

  it("keyframes interpolate with easing", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "k1",
          target: { type: "elements", ids: ["a"] },
          enabled: true,
          duration: 2,
          tracks: [
            {
              prop: "y",
              frames: [
                { t: 0, v: 0 },
                { t: 1, v: 100, ease: "easeOut" },
              ],
            },
          ],
        },
      ])
    )
    const quarter = sampleAt(compiled, 0.5, "a")!.y // nt = 0.25
    expect(quarter).toBeGreaterThan(25) // easeOut front-loads
    expect(sampleAt(compiled, 2, "a")!.y).toBe(100)
  })

  it("disabled tracks and unknown units sample to null", () => {
    const compiled = compileAnimations(
      sceneWith([
        {
          id: "t1",
          target: { type: "elements", ids: ["a"] },
          enabled: false,
          preset: "float",
        },
      ])
    )
    expect(compiled.active).toBe(false)
    expect(sampleAt(compiled, 1, "a")).toBeNull()
  })
})
