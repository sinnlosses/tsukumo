import { describe, expect, it } from "vitest"

import {
  readingPositionOf,
  scrollDeltaToRestore,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/reading-position.ts"

describe("readingPositionOf", () => {
  it("基準の線以前にある最後の見出しを選び、そこからのずれを返す", () => {
    expect(readingPositionOf([-300, -40, 200, 500], 0)).toEqual({ headingIndex: 1, offsetPx: -40 })
  })

  it("基準の線の少し下（余裕の 24px 以内）にある見出しも読んでいることにする", () => {
    expect(readingPositionOf([-300, 24, 200], 0)).toEqual({ headingIndex: 1, offsetPx: 24 })
    expect(readingPositionOf([-300, 25, 200], 0)).toEqual({ headingIndex: 0, offsetPx: -300 })
  })

  it("最初の見出しより上にいるときと、見出しが無いときは覚えない", () => {
    expect(readingPositionOf([100, 400], 0)).toBeUndefined()
    expect(readingPositionOf([], 0)).toBeUndefined()
  })
})

describe("scrollDeltaToRestore", () => {
  it("見出しが覚えたずれの位置に来るまでの差を返す（正は下へ）", () => {
    expect(scrollDeltaToRestore([120, 900], { headingIndex: 1, offsetPx: -40 }, 10)).toBe(930)
    expect(scrollDeltaToRestore([120, 900], { headingIndex: 0, offsetPx: 110 }, 10)).toBe(0)
  })

  it("覚えた番号の見出しが無いときは undefined", () => {
    expect(scrollDeltaToRestore([120], { headingIndex: 1, offsetPx: 0 }, 0)).toBeUndefined()
  })
})
