import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clampOutlineWidthPx,
  DEFAULT_OUTLINE_PANEL,
  isOutlineCollapsed,
  loadOutlinePanel,
  outlineWidthFromRatio,
  OUTLINE_WIDTH_MAX_PX,
  OUTLINE_WIDTH_MIN_PX,
  saveOutlinePanel,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/domain/outline-panel.ts"

const STORAGE_KEY = "tsukumo-outline-panel:v1"

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadOutlinePanel", () => {
  it("保存が無い（初回起動）ときは既定を返す", () => {
    expect(loadOutlinePanel()).toEqual(DEFAULT_OUTLINE_PANEL)
  })

  it("保存値が読めない（壊れた JSON）ときは既定に落ちる", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")

    expect(loadOutlinePanel()).toEqual(DEFAULT_OUTLINE_PANEL)
  })

  it("幅が可動域の外のときは既定に落ちる", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ widthPx: OUTLINE_WIDTH_MIN_PX - 1, collapse: "open" }),
    )

    expect(loadOutlinePanel()).toEqual(DEFAULT_OUTLINE_PANEL)
  })

  it("保存した幅と畳みの選択をそのまま読む", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widthPx: 200, collapse: "open" }))

    expect(loadOutlinePanel()).toEqual({ widthPx: 200, collapse: "open" })
  })

  it("幅がまだ決まっていない（undefined）保存値も読める", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widthPx: undefined, collapse: "collapsed" }))

    expect(loadOutlinePanel()).toEqual({ widthPx: undefined, collapse: "collapsed" })
  })

  it("旧い形の collapsed: true は畳む、false は選んでいないに読む", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widthPx: 200, collapsed: true }))
    expect(loadOutlinePanel()).toEqual({ widthPx: 200, collapse: "collapsed" })

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widthPx: 200, collapsed: false }))
    expect(loadOutlinePanel()).toEqual({ widthPx: 200, collapse: "unset" })
  })
})

describe("saveOutlinePanel / loadOutlinePanel", () => {
  it("保存した値をそのまま読み戻す（再読み込み後も保つ契約の往復）", () => {
    saveOutlinePanel({ widthPx: 220, collapse: "collapsed" })

    expect(loadOutlinePanel()).toEqual({ widthPx: 220, collapse: "collapsed" })
  })
})

describe("isOutlineCollapsed", () => {
  it("選んでいなければ札の幅で決まり、選んでいれば幅に関わらずその選択", () => {
    expect(isOutlineCollapsed("unset", true)).toBe(true)
    expect(isOutlineCollapsed("unset", false)).toBe(false)
    expect(isOutlineCollapsed("open", true)).toBe(false)
    expect(isOutlineCollapsed("collapsed", false)).toBe(true)
  })
})

describe("clampOutlineWidthPx", () => {
  it("可動域の内側はそのまま", () => {
    const value = (OUTLINE_WIDTH_MIN_PX + OUTLINE_WIDTH_MAX_PX) / 2
    expect(clampOutlineWidthPx(value)).toBe(value)
  })

  it("下限より小さい値は下限に詰める", () => {
    expect(clampOutlineWidthPx(OUTLINE_WIDTH_MIN_PX - 50)).toBe(OUTLINE_WIDTH_MIN_PX)
  })

  it("上限より大きい値は上限に詰める", () => {
    expect(clampOutlineWidthPx(OUTLINE_WIDTH_MAX_PX + 50)).toBe(OUTLINE_WIDTH_MAX_PX)
  })
})

describe("outlineWidthFromRatio", () => {
  it("比率に器の幅を掛けて px にし、可動域へ詰める", () => {
    const rect = new DOMRect(0, 0, 300, 0)
    expect(outlineWidthFromRatio(0.5, rect)).toBe(150)
  })

  it("比率が大きく器も広いときは上限に詰める", () => {
    const rect = new DOMRect(0, 0, 2000, 0)
    expect(outlineWidthFromRatio(0.9, rect)).toBe(OUTLINE_WIDTH_MAX_PX)
  })
})
