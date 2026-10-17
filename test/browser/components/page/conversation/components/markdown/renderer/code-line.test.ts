import type { Element, ElementContent } from "hast"
import { describe, expect, it } from "vitest"

import {
  diffLineSide,
  markDiffSign,
  splitCodeLines,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/code-line.ts"

const text = (value: string): ElementContent => ({ type: "text", value })
const span = (className: string, ...children: ElementContent[]): Element => ({
  type: "element",
  tagName: "span",
  properties: { className: [className] },
  children,
})

describe("diffLineSide", () => {
  it("行の先頭の hljs-addition / hljs-deletion で追加・削除を読み、ほかは undefined", () => {
    expect(diffLineSide([span("hljs-addition", text("+a"))])).toBe("added")
    expect(diffLineSide([span("hljs-deletion", text("-a"))])).toBe("removed")
    expect(diffLineSide([text(" a")])).toBeUndefined()
    expect(diffLineSide([])).toBeUndefined()
  })
})

describe("markDiffSign", () => {
  it("行の先頭の1字だけを包み、字の並びは変えない", () => {
    expect(markDiffSign([span("hljs-addition", text("+ab"))], "sign")).toEqual([
      span("hljs-addition", span("sign", text("+")), text("ab")),
    ])
  })
})

describe("splitCodeLines", () => {
  it("改行で行に分け、末尾の改行が作る空の最終行は含めない", () => {
    expect(splitCodeLines([text("a\nb\n")])).toEqual([[text("a")], [text("b")]])
  })

  it("途中の空行は空の行として残す", () => {
    expect(splitCodeLines([text("a\n\nb")])).toEqual([[text("a")], [], [text("b")]])
  })

  it("改行をまたぐ span は、行ごとに同じ class で開き直す", () => {
    expect(
      splitCodeLines([text("x "), span("hljs-comment", text("/* a\nb */")), text("\n")]),
    ).toEqual([
      [text("x "), span("hljs-comment", text("/* a"))],
      [span("hljs-comment", text("b */"))],
    ])
  })

  it("入れ子の span も行ごとに包み直す", () => {
    expect(splitCodeLines([span("outer", span("inner", text("a\nb")))])).toEqual([
      [span("outer", span("inner", text("a")))],
      [span("outer", span("inner", text("b")))],
    ])
  })
})
