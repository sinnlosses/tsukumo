import type { Element, ElementContent } from "hast"
import { describe, expect, it } from "vitest"

import { markDiffWords } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/diff-word-mark.ts"

const text = (value: string): ElementContent => ({ type: "text", value })
const span = (className: string, ...children: ElementContent[]): Element => ({
  type: "element",
  tagName: "span",
  properties: { className: [className] },
  children,
})

describe("markDiffWords", () => {
  it("区間が無ければ行のまま返す", () => {
    const line = [text("+a")]
    expect(markDiffWords(line, [], "w")).toBe(line)
  })

  it("1つの text の中の区間は、前後の text と区間の span に割れる", () => {
    expect(markDiffWords([text("+const a = 2")], [{ start: 11, end: 12 }], "w")).toEqual([
      text("+const a = "),
      span("w", text("2")),
    ])
  })

  it("hljs-addition の入れ子の中の区間は、その要素の中で包まれる", () => {
    const line = [span("hljs-addition", text("+foo(baz)"))]
    expect(markDiffWords(line, [{ start: 5, end: 8 }], "w")).toEqual([
      span("hljs-addition", text("+foo("), span("w", text("baz")), text(")")),
    ])
  })

  it("2つの区間と、複数の text にまたがる区間", () => {
    const line = [text("ab"), span("k", text("cd")), text("ef")]
    expect(
      markDiffWords(
        line,
        [
          { start: 0, end: 1 },
          { start: 3, end: 5 },
        ],
        "w",
      ),
    ).toEqual([
      span("w", text("a")),
      text("b"),
      span("k", text("c"), span("w", text("d"))),
      span("w", text("e")),
      text("f"),
    ])
  })
})
