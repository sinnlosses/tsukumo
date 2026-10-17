import { describe, expect, it } from "vitest"

import {
  isScrolledToEnd,
  readHeadingIndexOf,
  readingSectionOf,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/domain/reading-section.ts"

const ENTRIES = [
  { level: "section", text: "変わったこと" },
  { level: "sub", text: "小さな点" },
  { level: "section", text: "確かめたこと" },
  { level: "sub", text: "撮り直し" },
] as const

describe("readHeadingIndexOf", () => {
  const LEVELS = ["section", "sub", "section", "sub"] as const

  it("転がし切っていなければ、上端を通り過ぎた見出しのまま", () => {
    expect(readHeadingIndexOf(1, LEVELS, false)).toBe(1)
    expect(readHeadingIndexOf(-1, LEVELS, false)).toBe(-1)
  })

  it("転がし切ったときは、最後の `##` まで読んだことにする", () => {
    expect(readHeadingIndexOf(1, LEVELS, true)).toBe(2)
  })

  it("転がし切っていて最後の `##` より後ろの `###` を通っていれば、そちらのまま", () => {
    expect(readHeadingIndexOf(3, LEVELS, true)).toBe(3)
  })

  it("`##` が無ければ変えない", () => {
    expect(readHeadingIndexOf(-1, ["sub"], true)).toBe(-1)
  })
})

describe("isScrolledToEnd", () => {
  it("転がせて、端まで来ていれば真（1px の誤差を許す）", () => {
    expect(isScrolledToEnd({ scrollTop: 700, clientHeight: 300, scrollHeight: 1000 })).toBe(true)
    expect(isScrolledToEnd({ scrollTop: 699.5, clientHeight: 300, scrollHeight: 1000 })).toBe(true)
  })

  it("途中・上端・転がせない器・器が無いときは偽", () => {
    expect(isScrolledToEnd({ scrollTop: 400, clientHeight: 300, scrollHeight: 1000 })).toBe(false)
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 300, scrollHeight: 1000 })).toBe(false)
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 })).toBe(false)
    expect(isScrolledToEnd(null)).toBe(false)
  })
})

describe("readingSectionOf", () => {
  it("位置にいちばん近い手前の `##` を返す", () => {
    expect(readingSectionOf(ENTRIES, 0, true)).toEqual({ kind: "shown", text: "変わったこと" })
    expect(readingSectionOf(ENTRIES, 2, true)).toEqual({ kind: "shown", text: "確かめたこと" })
  })

  it("`###` の途中にいても親の `##` を返す", () => {
    expect(readingSectionOf(ENTRIES, 1, true)).toEqual({ kind: "shown", text: "変わったこと" })
    expect(readingSectionOf(ENTRIES, 3, true)).toEqual({ kind: "shown", text: "確かめたこと" })
  })

  it("まだ見出しを通っていなければ出さない", () => {
    expect(readingSectionOf(ENTRIES, 0, false)).toEqual({ kind: "none" })
  })

  it("手前に `##` が無ければ出さない", () => {
    expect(readingSectionOf([{ level: "sub", text: "先頭の小節" }], 0, true)).toEqual({
      kind: "none",
    })
  })

  it("見出しが無ければ出さない", () => {
    expect(readingSectionOf([], 0, true)).toEqual({ kind: "none" })
  })
})
