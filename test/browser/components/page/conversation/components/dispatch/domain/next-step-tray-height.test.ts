import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  loadNextStepTrayHeight,
  nextStepTrayHeightAt,
  resetNextStepTrayHeight,
  saveNextStepTrayHeight,
} from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/next-step-tray-height.ts"

const STORAGE_KEY = "tsukumo-next-step-tray-height:v1"
const MIN_HEIGHT_PX = 30

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadNextStepTrayHeight", () => {
  it("保存が無いときは undefined（CSS の既定の3段に任せる）", () => {
    expect(loadNextStepTrayHeight()).toBeUndefined()
  })

  it("保存した高さをそのまま読む", () => {
    saveNextStepTrayHeight(180)

    expect(loadNextStepTrayHeight()).toBe(180)
  })

  it("既定に戻すと undefined を読む", () => {
    saveNextStepTrayHeight(180)
    resetNextStepTrayHeight()

    expect(loadNextStepTrayHeight()).toBeUndefined()
  })
})

describe("nextStepTrayHeightAt", () => {
  const drag = { chipsBottom: 700, gripGap: 30, contentHeight: 400 }

  it("並びの下端から pointer までの距離から、仕切りと並びの間を引いた高さにする", () => {
    expect(nextStepTrayHeightAt({ ...drag, pointerY: 500 })).toBe(170)
  })

  it("札1段より低くしない", () => {
    expect(nextStepTrayHeightAt({ ...drag, pointerY: 690 })).toBe(MIN_HEIGHT_PX)
  })

  it("札が全部見える高さより高くしない", () => {
    expect(nextStepTrayHeightAt({ ...drag, pointerY: 0 })).toBe(400)
  })
})
