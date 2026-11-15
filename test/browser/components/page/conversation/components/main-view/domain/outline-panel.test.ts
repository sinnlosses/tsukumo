import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  isOutlineCollapsed,
  loadOutlinePanel,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-panel.ts"

const STORAGE_KEY = "tsukumo-outline-panel:v1"

const DEFAULT_OUTLINE_PANEL = { widthPx: undefined, collapse: "unset" } as const

const OUTLINE_WIDTH_MIN_PX = 128

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

describe("isOutlineCollapsed", () => {
  it("畳むのは畳むを選んだときだけで、選んでいなければ開いている", () => {
    expect(isOutlineCollapsed("unset")).toBe(false)
    expect(isOutlineCollapsed("open")).toBe(false)
    expect(isOutlineCollapsed("collapsed")).toBe(true)
  })
})
