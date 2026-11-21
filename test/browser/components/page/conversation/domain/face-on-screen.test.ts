import { describe, expect, it } from "vitest"

import {
  faceOnScreen,
  gloomOnScreen,
} from "../../../../../../src/browser/components/page/conversation/domain/face-on-screen.ts"

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

describe("しょんぼりの影の置き場", () => {
  const portrait = { left: 500, top: 100, width: 400, height: 500 }

  it("領域が十分広ければ、立ち絵の箱を左右へ60%ずつ広げ、上端を10%上・高さを80%にした矩形になる", () => {
    const area = { left: 0, top: 0, width: 2000, height: 1000 }

    expect(gloomOnScreen({ portrait, area })).toEqual({
      left: 260,
      top: 50,
      width: 880,
      height: 400,
    })
  })

  it("領域が狭ければ、左右と上が領域の端で切られる", () => {
    const area = { left: 400, top: 80, width: 600, height: 1000 }

    expect(gloomOnScreen({ portrait, area })).toEqual({
      left: 400,
      top: 80,
      width: 600,
      height: 370,
    })
  })
})
