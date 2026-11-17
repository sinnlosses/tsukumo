import { describe, expect, it } from "vitest"

import {
  faceOnScreen,
  tailAim,
  type Point,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/tail-aim.ts"

const BUBBLE = { left: 400, top: 300, bottom: 360 } as const

function degreesBetween(from: Point, a: Point, b: Point): number {
  const angle = (to: Point): number => Math.atan2(to.y - from.y, to.x - from.x)
  const diff = Math.abs(angle(a) - angle(b)) * (180 / Math.PI)
  return Math.min(diff, 360 - diff)
}

describe("尾の向きと長さ", () => {
  const faces = {
    働く: { x: 120, y: 330 },
    答える: { x: 150, y: 420 },
    完了: { x: 90, y: 600 },
    定位置: { x: 200, y: 500 },
  } as const

  for (const [name, face] of Object.entries(faces)) {
    it(`${name}の配置で、先が根元から顔への向きと10度以内で合い、長さが8〜20pxに収まる`, () => {
      const aim = tailAim({ bubble: BUBBLE, face, gapBelow: Number.POSITIVE_INFINITY })
      const length = Math.hypot(aim.tip.x - aim.root.x, aim.tip.y - aim.root.y)

      expect(degreesBetween(aim.root, aim.tip, face)).toBeLessThanOrEqual(10)
      expect(length).toBeGreaterThanOrEqual(8)
      expect(length).toBeLessThanOrEqual(20.001)
    })
  }

  it("顔が横にあるときは左の辺から、下にあって空きがあるときは下の辺から出す", () => {
    expect(tailAim({ bubble: BUBBLE, face: { x: 100, y: 340 }, gapBelow: 100 }).side).toBe("left")
    expect(tailAim({ bubble: BUBBLE, face: { x: 410, y: 700 }, gapBelow: 100 }).side).toBe("bottom")
  })

  it("すぐ下の空きが12px未満なら、顔が下にあっても左の辺から出す", () => {
    expect(tailAim({ bubble: BUBBLE, face: { x: 410, y: 700 }, gapBelow: 6 }).side).toBe("left")
  })

  it("先がすぐ下の物の縁を越えない", () => {
    const gapBelow = 14
    const aim = tailAim({ bubble: BUBBLE, face: { x: 410, y: 700 }, gapBelow })

    expect(aim.tip.y).toBeLessThanOrEqual(BUBBLE.bottom + gapBelow)
    expect(Math.hypot(aim.tip.x - aim.root.x, aim.tip.y - aim.root.y)).toBeGreaterThanOrEqual(8)
  })
})

describe("顔の位置", () => {
  const box = { left: 0, bottom: 900, width: 400, height: 800 }

  it("faceAt があればその割合で、絵は箱の下端に寄せ縦横比を保って収まる", () => {
    const point = faceOnScreen({
      box,
      naturalWidth: 400,
      naturalHeight: 1000,
      faceAt: { x: 0.5, y: 0.36 },
    })

    // 絵の高さは 800、幅は 320。左右は余白 40。
    expect(point.x).toBeCloseTo(40 + 160)
    expect(point.y).toBeCloseTo(100 + 800 * 0.36)
  })

  it("faceAt が無ければ既定（x: 0.5・y: 0.25）になる", () => {
    const point = faceOnScreen({ box, naturalWidth: 400, naturalHeight: 800 })

    expect(point.x).toBeCloseTo(200)
    expect(point.y).toBeCloseTo(100 + 800 * 0.25)
  })
})
