import { markdownLanguage } from "@codemirror/lang-markdown"
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language"
import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import {
  concealedMarks,
  type ConcealedMark,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/markdown-editor-surface/domain/markdown-mark-concealment.ts"

describe("concealedMarks", () => {
  it("キャレットの無い行の記号を隠し、箇条書きの印を替え、リンクの字に行き先を添える", () => {
    const text = [
      "# 見出し",
      "**太** *斜* ~~消~~ `c` [字](https://example.test)",
      "> 引用",
      "- 一",
      "末尾",
    ].join("\n")

    expect(concealedTexts(text, caretAt(text.length))).toEqual([
      ["hidden", "# "],
      ["hidden", "**"],
      ["hidden", "**"],
      ["hidden", "*"],
      ["hidden", "*"],
      ["hidden", "~~"],
      ["hidden", "~~"],
      ["hidden", "`"],
      ["hidden", "`"],
      ["hidden", "["],
      ["link-label", "字", "https://example.test"],
      ["hidden", "](https://example.test)"],
      ["quote-line", ""],
      ["hidden", "> "],
      ["bullet", "- "],
    ])
  })

  it("キャレットの行は、行頭の `> ` `- ` のほかの記号を返さない", () => {
    expect(concealedTexts("> **引用**\n\n末尾", caretAt(3))).toEqual([
      ["quote-line", ""],
      ["hidden", "> "],
    ])
    expect(concealedTexts("- **一**\n二", caretAt(3))).toEqual([["bullet", "- "]])
  })

  it("キャレットの行の行頭の `>` は打った時点で罫に置き換え、`-` は後ろの空白を打つまで置き換えない", () => {
    expect(concealedTexts(">", caretAt(1))).toEqual([
      ["quote-line", ""],
      ["hidden", ">"],
    ])
    expect(concealedTexts(">a", caretAt(1))).toEqual([
      ["quote-line", ""],
      ["hidden", ">"],
    ])
    expect(concealedTexts("-", caretAt(1))).toEqual([])
    expect(concealedTexts("- ", caretAt(2))).toEqual([["bullet", "- "]])
  })

  it("選択が2行にまたがると、どちらの行の記号も返さない", () => {
    const text = "# 一\n**二**\n`三`"

    expect(concealedTexts(text, EditorSelection.single(2, 7))).toEqual([
      ["hidden", "`"],
      ["hidden", "`"],
    ])
  })

  it("番号付きの印・表・行き先の無い参照の形のリンクは触らない", () => {
    const text = "1. 一\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[字][ref]\n末尾"

    expect(concealedTexts(text, caretAt(text.length))).toEqual([])
  })
})

function caretAt(position: number): EditorSelection {
  return EditorSelection.single(position)
}

/** 返った範囲を、種類と範囲の字（リンクなら行き先も）の組にする。 */
function concealedTexts(text: string, selection: EditorSelection): readonly (readonly string[])[] {
  const created = EditorState.create({ doc: text, selection, extensions: [markdownLanguage] })
  if (ensureSyntaxTree(created, created.doc.length, 1000) === null) {
    throw new Error("構文木を最後まで作れなかった")
  }
  // syntaxTree(state) は create 時の木の写しを返すので、更新して完成した木を取り込む。
  const state = created.update({}).state
  if (syntaxTree(state).length !== state.doc.length) {
    throw new Error("状態の構文木が文書の終わりまで届いていない")
  }
  return concealedMarks(state).map((mark: ConcealedMark) => {
    switch (mark.kind) {
      case "quote-line":
        return [mark.kind, ""]
      case "link-label":
        return [mark.kind, state.sliceDoc(mark.from, mark.to), mark.url]
      case "hidden":
      case "bullet":
        return [mark.kind, state.sliceDoc(mark.from, mark.to)]
    }
  })
}
