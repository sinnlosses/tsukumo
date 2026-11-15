import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_SPLIT,
  leftPxFromRatio,
  loadSplit,
  sidebarPercentFromRatio,
} from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/domain/split.ts"

// `localStorage` に持つ幅の読み取り側。読めない・保存が無い・可動域の外のときに
// 既定へ落ちる契約（docs/architecture/display/input-box.md「表示できないものがあっても残りを
// 表示して動作を続ける」）を確かめる。書き込みの失敗（プライベートウィンドウ限定）は
// docs/coding-standards.md「足すかどうか」で埋めないと決めている。
const STORAGE_KEY = "tsukumo-layout-split:v2"
const V1_KEY = "tsukumo-layout-split:v1"
const OUTLINE_KEY = "tsukumo-outline-panel:v1"

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe("loadSplit", () => {
  it("保存が無い（初回起動）ときは既定（左の列 238px・サイドバー 22.8%）で開く", () => {
    expect(loadSplit()).toEqual({ leftPx: 238, sidebar: 22.8 })
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("v1 だけが保存されているときは読まずに既定で開き、v1 の値は消さない", () => {
    const v1 = JSON.stringify({ rowTop: 40, topLeft: 30, bottomLeft: 20 })
    localStorage.setItem(V1_KEY, v1)

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
    expect(localStorage.getItem(V1_KEY)).toBe(v1)
  })

  it("v2 が保存されているときはサイドバーの幅をそのまま読む", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ leftPx: 300, sidebar: 30 }))

    expect(loadSplit()).toEqual({ leftPx: 300, sidebar: 30 })
  })

  it("v2 に左の列の幅が無ければ、やり取りの列の幅（widthPx）を左の列の幅として読む", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebar: 30 }))
    localStorage.setItem(OUTLINE_KEY, JSON.stringify({ widthPx: 260, collapse: "open" }))

    expect(loadSplit()).toEqual({ leftPx: 260, sidebar: 30 })
  })

  it("v2 が無くても、やり取りの列の幅（widthPx）を左の列の幅として読む", () => {
    localStorage.setItem(OUTLINE_KEY, JSON.stringify({ widthPx: 260, collapse: "open" }))

    expect(loadSplit()).toEqual({ leftPx: 260, sidebar: DEFAULT_SPLIT.sidebar })
  })

  it("やり取りの列の幅が 200〜400px の外なら端に収める", () => {
    localStorage.setItem(OUTLINE_KEY, JSON.stringify({ widthPx: 128, collapse: "open" }))
    expect(loadSplit().leftPx).toBe(200)

    localStorage.setItem(OUTLINE_KEY, JSON.stringify({ widthPx: 900, collapse: "open" }))
    expect(loadSplit().leftPx).toBe(400)
  })

  it("v2 の左の列の幅が可動域の外なら端に収める", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ leftPx: 50, sidebar: 30 }))

    expect(loadSplit()).toEqual({ leftPx: 200, sidebar: 30 })
  })

  it("壊れた値（JSON でない・サイドバーが可動域の外）は既定で開く", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ leftPx: 300, sidebar: 99 }))
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })
})

describe("leftPxFromRatio", () => {
  it("比率に器の幅を掛けて px にし、200〜400px の可動域へ詰める", () => {
    expect(leftPxFromRatio(0.1, new DOMRect(0, 0, 1000, 0))).toBe(200)
    expect(leftPxFromRatio(0.25, new DOMRect(0, 0, 1000, 0))).toBe(250)
    expect(leftPxFromRatio(0.9, new DOMRect(0, 0, 2000, 0))).toBe(400)
  })
})

describe("sidebarPercentFromRatio", () => {
  it("器の右端からの幅を % にし、可動域へ詰める", () => {
    expect(sidebarPercentFromRatio(0.75)).toBe(25)
    expect(sidebarPercentFromRatio(0.99)).toBe(15)
    expect(sidebarPercentFromRatio(0.2)).toBe(40)
  })
})
