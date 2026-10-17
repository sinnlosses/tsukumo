import { describe, expect, it } from "vitest"

import { diffWords } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/word-diff.ts"

function sliced(text: string, ranges: readonly { start: number; end: number }[]): string[] {
  return ranges.map((range) => text.slice(range.start, range.end))
}

describe("diffWords", () => {
  it("1語の置き換えは、両側とも違う語の1区間だけ返す", () => {
    const result = diffWords("const a = 1", "const a = 2")
    expect(sliced("const a = 1", result.before)).toEqual(["1"])
    expect(sliced("const a = 2", result.after)).toEqual(["2"])
  })

  it("記号に挟まれた語だけを返す", () => {
    const result = diffWords("foo(bar)", "foo(baz)")
    expect(sliced("foo(bar)", result.before)).toEqual(["bar"])
    expect(sliced("foo(baz)", result.after)).toEqual(["baz"])
  })

  it("挿入は後ろだけに区間が出る", () => {
    const result = diffWords("a b", "a x b")
    expect(result.before).toEqual([])
    expect(sliced("a x b", result.after)).toEqual(["x "])
  })

  it("削除は前だけに区間が出る", () => {
    const result = diffWords("a x b", "a b")
    expect(sliced("a x b", result.before)).toEqual(["x "])
    expect(result.after).toEqual([])
  })

  it("全部違えば両側とも全体", () => {
    expect(diffWords("abc", "xyz")).toEqual({
      before: [{ start: 0, end: 3 }],
      after: [{ start: 0, end: 3 }],
    })
  })

  it("同じ行は両側とも空", () => {
    expect(diffWords("same line", "same line")).toEqual({ before: [], after: [] })
  })

  it("語が 200 を超える行は両側とも空で、200 ちょうどは区間を返す", () => {
    const line = (count: number, last: string): string => `${"!".repeat(count - 1)}${last}`
    expect(diffWords(line(201, "a"), line(201, "b"))).toEqual({ before: [], after: [] })
    expect(diffWords(line(200, "a"), line(200, "b")).before).toEqual([{ start: 199, end: 200 }])
  })
})
