import { describe, expect, it } from "vitest"

import { quoteOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/selection-quote.ts"

describe("選んだ字を引用に整える", () => {
  it("1行は頭に > を付ける", () => {
    expect(quoteOf("架空の一文")).toBe("> 架空の一文")
  })

  it("複数行は行ごとに > を付け、空行にも付ける", () => {
    expect(quoteOf("一行目\n\n三行目")).toBe("> 一行目\n> \n> 三行目")
  })

  it("300字ちょうどは切らない", () => {
    const text = "あ".repeat(300)
    expect(quoteOf(text)).toBe(`> ${text}`)
  })

  it("301字は300字で切って末尾に … を付ける", () => {
    expect(quoteOf("あ".repeat(301))).toBe(`> ${"あ".repeat(300)}…`)
  })

  it("改行をまたいで切っても各行に > が付く", () => {
    const text = `${"あ".repeat(298)}\nいう`
    expect(quoteOf(text)).toBe(`> ${"あ".repeat(298)}\n> い…`)
  })

  it("前後の空白と改行は引用に入れない", () => {
    expect(quoteOf("\n架空の段落\n\n")).toBe("> 架空の段落")
  })

  it("空の選択は空文字", () => {
    expect(quoteOf("")).toBe("")
  })
})
