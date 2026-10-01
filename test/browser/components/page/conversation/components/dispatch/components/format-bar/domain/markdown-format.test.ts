import { describe, expect, it } from "vitest"

import {
  formatEdit,
  type FormatEdit,
  type MarkdownFormat,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/format-bar/domain/markdown-format.ts"

/** 変更を文面へ当てた結果と、そのあとの選択された字。 */
function applied(text: string, from: number, to: number, format: MarkdownFormat) {
  const edit: FormatEdit = formatEdit({ text, from, to }, format)
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  return { next, selected: next.slice(edit.anchor, edit.head), caret: edit.anchor }
}

describe("formatEdit", () => {
  it.each([
    ["bold", "**"],
    ["italic", "*"],
    ["strikethrough", "~~"],
    ["code", "`"],
  ] as const)("%s は選んだ範囲を記号で囲み、選択は字のまま残す", (format, mark) => {
    const result = applied("あいう", 1, 2, format)
    expect(result.next).toBe(`あ${mark}い${mark}う`)
    expect(result.selected).toBe("い")
  })

  it("範囲が無いときは記号の対だけ入れて、キャレットを間に置く", () => {
    const result = applied("あい", 1, 1, "bold")
    expect(result.next).toBe("あ****い")
    expect(result.caret).toBe(3)
    expect(result.selected).toBe("")
  })

  it("リンクは範囲があれば宛先の仮の字を選び、無ければ [] の間にキャレットを置く", () => {
    const ranged = applied("あいう", 1, 2, "link")
    expect(ranged.next).toBe("あ[い](url)う")
    expect(ranged.selected).toBe("url")
    const empty = applied("あ", 1, 1, "link")
    expect(empty.next).toBe("あ[]()")
    expect(empty.caret).toBe(2)
  })

  it("行の書式は選択にかかる各行の頭へ付け、選択を記号のぶんずらす", () => {
    const text = "一\n二\n三"
    const result = applied(text, 2, 5, "bullet")
    expect(result.next).toBe("一\n- 二\n- 三")
    expect(result.selected).toBe("二\n- 三")
  })

  it("範囲が無いときはキャレットのある行だけに付ける", () => {
    expect(applied("一\n二", 3, 3, "quote").next).toBe("一\n> 二")
    expect(applied("", 0, 0, "quote").next).toBe("> ")
  })

  it("選択が次の行の頭で終わるときは、その行に付けない", () => {
    expect(applied("一\n二", 0, 2, "bullet").next).toBe("- 一\n二")
  })
})
