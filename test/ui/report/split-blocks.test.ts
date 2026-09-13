import { describe, expect, it } from "bun:test"

import { splitReportBlocks } from "../../../src/ui/report/split-blocks.ts"

describe("splitReportBlocks", () => {
  it("空行で塊に割る", () => {
    expect(splitReportBlocks("段落1\n\n段落2\n\n段落3")).toEqual(["段落1", "段落2", "段落3"])
  })

  it("連続する空行は1つの区切りとして扱う", () => {
    expect(splitReportBlocks("段落1\n\n\n\n段落2")).toEqual(["段落1", "段落2"])
  })

  it("フェンス付きコードブロックの中の空行では割らない", () => {
    const markdown = "前置き\n\n```js\nconst a = 1\n\nconst b = 2\n```\n\n後書き"

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toContain("const a = 1")
    expect(blocks[1]).toContain("const b = 2")
  })

  it("閉じていないフェンスは、末尾まで1つの塊のままになる（書きかけの本文。テスト観点9）", () => {
    const markdown = "前置き\n\n```js\nconst a = 1\n\n### 見出しに見える行\n\n| a | b |"

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toContain("### 見出しに見える行")
    expect(blocks[1]).toContain("| a | b |")
  })
})
