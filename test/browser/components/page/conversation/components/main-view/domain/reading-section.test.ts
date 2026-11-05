import { describe, expect, it } from "vitest"

import {
  isScrolledToEnd,
  readHeadingIndexOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/reading-section.ts"

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
