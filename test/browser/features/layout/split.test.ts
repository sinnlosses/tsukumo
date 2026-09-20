import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  DEFAULT_SPLIT,
  loadSplit,
  saveSplit,
} from "../../../../src/browser/features/layout/split.ts"

// `localStorage` に持つ比率の読み取り側。読めない・保存が無い・可動域の外のときに
// DEFAULT_SPLIT へ落ちる契約（docs/requirements.md 4.2「表示できないものがあっても残りを
// 表示して動作を続ける」）を確かめる。書き込みの失敗（プライベートウィンドウ限定）は
// docs/coding-standards.md「足すかどうか」で埋めないと決めている。
const STORAGE_KEY = "tsukumo-layout-split:v1"

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadSplit", () => {
  it("保存が無い（初回起動）ときは既定の比率を返す", () => {
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("保存値が読めない（壊れた JSON）ときは既定の比率に落ちる", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("保存値が可動域の外のときは既定の比率に落ちる", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rowTop: 5, topLeft: 50, bottomLeft: 50 }))

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  // 雑談用の上下比だけは、無くても壊れていても `undefined` に畳むだけで、他の3項は保存値の
  // ままにする（雑談で一度も動かしていない状態＝この項が無い保存値。項を足す前の保存値も
  // ここを通って読める）。
  it("雑談用の比率が無い保存値は、他の3項をそのまま読んで雑談用だけ未設定になる", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rowTop: 40, topLeft: 30, bottomLeft: 20 }))

    expect(loadSplit()).toEqual({
      rowTop: 40,
      topLeft: 30,
      bottomLeft: 20,
      collapsedRowTop: undefined,
    })
  })

  it("雑談用の比率が壊れているときは、そこだけ未設定にして他の3項は落とさない", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rowTop: 40, topLeft: 30, bottomLeft: 20, collapsedRowTop: "80" }),
    )

    expect(loadSplit()).toEqual({
      rowTop: 40,
      topLeft: 30,
      bottomLeft: 20,
      collapsedRowTop: undefined,
    })
  })

  it("雑談用の比率が可動域の外のときも、そこだけ未設定になる", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rowTop: 40, topLeft: 30, bottomLeft: 20, collapsedRowTop: 99 }),
    )

    expect(loadSplit().collapsedRowTop).toBeUndefined()
  })

  it("雑談用の比率は、未設定のままでも値が入っていても往復できる", () => {
    saveSplit(DEFAULT_SPLIT)
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)

    saveSplit({ ...DEFAULT_SPLIT, collapsedRowTop: 80 })
    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, collapsedRowTop: 80 })
  })
})
