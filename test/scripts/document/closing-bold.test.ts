import { describe, expect, it } from "vitest"

import { findUnclosedBold } from "../../../scripts/document/closing-bold.ts"

describe("findUnclosedBold", () => {
  it.each([
    "**これは正典ではない。**正典は別にある",
    "前置き **「語」**を使う",
    "**一つ目**と **二つ目。**続き",
  ])("閉じない形は落とす: %s", (line) => {
    expect(findUnclosedBold(`先頭\n${line}\n`).map((found) => found.line)).toEqual([2])
  })

  it.each([
    "**語**は",
    "（**語**）",
    "**文。** 続き",
    "**文。**",
    "**文。**、続き",
    "`**ない。**正典`",
    "**開き**は約物の直後でもよい。**閉じ**です",
    "太字なし。",
  ])("通る: %s", (line) => {
    expect(findUnclosedBold(line)).toEqual([])
  })

  it("行をまたぐ太字と、行をまたぐ inline code は対にずれない", () => {
    expect(findUnclosedBold("**一行目\n二行目。** 三\n`a\nb` **c**\n")).toEqual([])
  })

  it("コードのフェンスの中は見ない", () => {
    expect(findUnclosedBold("```\n**ない。**正典\n```\n")).toEqual([])
  })
})
