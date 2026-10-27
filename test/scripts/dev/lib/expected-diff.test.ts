import { describe, expect, test } from "vitest"

import {
  countExpectedDiffLines,
  formatExpectedDiffLine,
} from "../../../../scripts/dev/lib/expected-diff.ts"

describe("countExpectedDiffLines", () => {
  test("足した行と消した行を足し、二進のファイルの行は数えない", () => {
    expect(countExpectedDiffLines("3\t1\ta.dom.json\n0\t90\tb.dom.json\n-\t-\tc.png\n", [])).toBe(
      94,
    )
  })

  test("未追跡のファイルは全行を足した行に数え、改行で終わらない最後の行も1行に数える", () => {
    expect(countExpectedDiffLines("", ["1\n2\n", "1\n2\n3", ""])).toBe(5)
  })
})

describe("formatExpectedDiffLine", () => {
  test("STAGE の行に段名 expected-diff と行数を並べる", () => {
    expect(formatExpectedDiffLine(1888)).toBe("STAGE\texpected-diff\t1888")
  })
})
