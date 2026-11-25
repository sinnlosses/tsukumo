import { describe, expect, it } from "vitest"

import {
  fitViewport,
  movedViewport,
  zoomedAround,
  zoomedViewport,
} from "../../../../src/browser/features/architecture-map/architecture-map-viewport.ts"

const CONTENT = { width: 1000, height: 500 }
const FRAME = { width: 500, height: 400 }

describe("architecture-map-viewport", () => {
  it("図全体を枠に収め、枠の中央に置く", () => {
    const fit = fitViewport(CONTENT, FRAME)

    expect(fit.scale).toBe(0.5)
    expect(fit.x).toBe(0)
    expect(fit.y).toBe(75)
  })

  it("拡大は上限の 2 で止まる", () => {
    let viewport = fitViewport(CONTENT, FRAME)
    for (let step = 0; step < 20; step += 1) {
      viewport = zoomedViewport(viewport, "in", CONTENT, FRAME)
    }

    expect(viewport.scale).toBe(2)
  })

  it("縮小は、収まる倍率と 0.25 の小さい方で止まる", () => {
    let viewport = fitViewport(CONTENT, FRAME)
    for (let step = 0; step < 20; step += 1) {
      viewport = zoomedViewport(viewport, "out", CONTENT, FRAME)
    }
    const tallFit = fitViewport({ width: 4000, height: 2000 }, FRAME)
    let tall = tallFit
    for (let step = 0; step < 20; step += 1) {
      tall = zoomedViewport(tall, "out", { width: 4000, height: 2000 }, FRAME)
    }

    expect(viewport.scale).toBe(0.25)
    expect(tall.scale).toBeCloseTo(0.125)
  })

  it("拡大・縮小しても枠の中心が指す図の点は動かない", () => {
    const start = movedViewport(fitViewport(CONTENT, FRAME), 30, -10)
    const pointAtCenter = (v: typeof start) => [
      (FRAME.width / 2 - v.x) / v.scale,
      (FRAME.height / 2 - v.y) / v.scale,
    ]

    const zoomed = zoomedViewport(start, "in", CONTENT, FRAME)

    expect(pointAtCenter(zoomed)[0]).toBeCloseTo(pointAtCenter(start)[0] ?? 0)
    expect(pointAtCenter(zoomed)[1]).toBeCloseTo(pointAtCenter(start)[1] ?? 0)
  })

  it("点を中心に拡大・縮小すると、その点の下の図の位置は動かない", () => {
    const start = movedViewport(fitViewport(CONTENT, FRAME), 30, -10)
    const anchor = { x: 120, y: 90 }
    const under = (v: typeof start) => [(anchor.x - v.x) / v.scale, (anchor.y - v.y) / v.scale]

    for (const factor of [1.7, 0.6]) {
      const zoomed = zoomedAround(start, factor, anchor, CONTENT, FRAME)

      expect(zoomed.scale).toBeCloseTo(start.scale * factor)
      expect(under(zoomed)[0]).toBeCloseTo(under(start)[0] ?? 0)
      expect(under(zoomed)[1]).toBeCloseTo(under(start)[1] ?? 0)
    }
  })

  it("点を中心にしても、倍率は上限の 2 と下限で止まる", () => {
    const start = fitViewport(CONTENT, FRAME)
    const anchor = { x: 120, y: 90 }

    expect(zoomedAround(start, 100, anchor, CONTENT, FRAME).scale).toBe(2)
    expect(zoomedAround(start, 0.001, anchor, CONTENT, FRAME).scale).toBe(0.25)
  })

  it("全体の倍率へ戻すには fitViewport を引き直す（動かした位置は捨てる）", () => {
    const moved = movedViewport(fitViewport(CONTENT, FRAME), 40, 40)

    expect(fitViewport(CONTENT, FRAME)).not.toEqual(moved)
    expect(fitViewport(CONTENT, FRAME).scale).toBe(moved.scale)
  })
})
