import { describe, expect, it } from "bun:test"

import { splitReportBlocks } from "../../../../../src/browser/features/main-view/markdown/split-blocks.ts"

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

  it("details の中の空行では割らない（中の Markdown を解釈させるには空行が要る）", () => {
    const markdown = [
      "結論の段落",
      "",
      "<details>",
      "<summary>長い根拠</summary>",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "</details>",
      "",
      "後書き",
    ].join("\n")

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toEqual([
      "結論の段落",
      "<details>\n<summary>長い根拠</summary>\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n</details>",
      "後書き",
    ])
  })

  it("同じタグが入れ子になっていても、外側が閉じるまで割らない", () => {
    const markdown = [
      '<div class="cols">',
      '<div class="card">',
      "",
      "案A",
      "",
      "</div>",
      '<div class="card">',
      "",
      "案B",
      "",
      "</div>",
      "</div>",
      "",
      "後書き",
    ].join("\n")

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain("案A")
    expect(blocks[0]).toContain("案B")
    expect(blocks[0]?.endsWith("</div>\n</div>")).toBe(true)
    expect(blocks[1]).toBe("後書き")
  })

  it("1行の中で開いて閉じる HTML は、その行のあとの空行で割れる", () => {
    const markdown = '<div class="note">結論</div>\n\n次の段落'

    expect(splitReportBlocks(markdown)).toEqual(['<div class="note">結論</div>', "次の段落"])
  })

  it("自己閉じタグと void 要素を開きとして数えない", () => {
    const markdown =
      '行1<br>\n\n<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1" /></svg>\n\n行2'

    expect(splitReportBlocks(markdown)).toHaveLength(3)
  })

  it("閉じていない HTML ブロックは、例外にならず最後の塊に収まる（書きかけの本文）", () => {
    const markdown = "前置き\n\n<details>\n<summary>書きかけ</summary>\n\n途中の段落"

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toBe("<details>\n<summary>書きかけ</summary>\n\n途中の段落")
  })

  it("段落の途中に出てくるインラインの HTML では塊をつなげない", () => {
    const markdown = '状態は <span class="badge badge-ok">OK</span> だった\n\n次の段落'

    expect(splitReportBlocks(markdown)).toHaveLength(2)
  })

  it("フェンスの中に書かれた HTML のタグは数えない", () => {
    const markdown = '```html\n<div class="cols">\n```\n\n後書き'

    expect(splitReportBlocks(markdown)).toEqual(['```html\n<div class="cols">\n```', "後書き"])
  })

  it("コードスパンの中のタグは数えない", () => {
    const markdown =
      "<details>\n<summary>見出し</summary>\n\n`</details>` と書いた行\n\n</details>\n\n後書き"

    const blocks = splitReportBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toBe("後書き")
  })
})
