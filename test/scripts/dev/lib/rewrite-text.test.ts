import { describe, expect, it } from "vitest"

import { expandTemplate, replaceAll } from "../../../../scripts/dev/lib/rewrite-text.ts"

describe("replaceAll", () => {
  it("一致した箇所をすべて置き換え、件数を返す", () => {
    expect(replaceAll("a-b-a", "a", "x")).toEqual({ text: "x-b-x", count: 2 })
  })

  it("一致が無ければ件数は 0 で、文字列は変わらない", () => {
    expect(replaceAll("abc", "z", "x")).toEqual({ text: "abc", count: 0 })
  })

  it("正規表現の記号は文字どおりに扱う", () => {
    expect(replaceAll("a.b axb", "a.b", "-").text).toBe("- axb")
  })
})

describe("expandTemplate", () => {
  it("{{名前}} を値で置き換える", () => {
    expect(expandTemplate("{{id}}: {{id}}/{{title}}", { id: "1", title: "t" })).toBe("1: 1/t")
  })

  it("値に無い名前があれば、その名前を挙げて投げる", () => {
    expect(() => expandTemplate("{{missing}}", {})).toThrow("{{missing}}")
  })
})
