import { describe, expect, it } from "vitest"

import {
  decodeMarks,
  encodeMarks,
  foldedRanges,
  markFitsLines,
  readMarkLines,
  sourceLineCount,
  splitMarksToken,
} from "../../../src/shared/report/code-mark.ts"

const mark = (lines: string) => ({ lines, label: "架空" })

describe("readMarkLines", () => {
  it("1 行と範囲を読む", () => {
    expect(readMarkLines("12")).toEqual({ start: 12, end: 12 })
    expect(readMarkLines("4-8")).toEqual({ start: 4, end: 8 })
    expect(readMarkLines(" 4 - 8 ")).toEqual({ start: 4, end: 8 })
  })

  it.each(["", "0", "0-3", "8-4", "a", "1-", "-3", "1,3"])("%s は読めない", (lines) => {
    expect(readMarkLines(lines)).toBeUndefined()
  })
})

describe("markFitsLines・sourceLineCount", () => {
  it("末尾の改行を数えず、行数以内だけ収まる", () => {
    expect(sourceLineCount("a\nb\n")).toBe(2)
    expect(sourceLineCount("a\nb")).toBe(2)
    expect(markFitsLines(mark("2"), 2)).toBe(true)
    expect(markFitsLines(mark("3"), 2)).toBe(false)
    expect(markFitsLines(mark("x"), 2)).toBe(false)
  })
})

describe("foldedRanges", () => {
  it("印の無い塊は畳まない", () => {
    expect(foldedRanges(100, [])).toEqual([])
    expect(foldedRanges(100, [mark("x")])).toEqual([])
  })

  it("印の 3 行外が 20 行ちょうどなら畳まず、21 行なら畳む", () => {
    // 印は 1 行目。残すのは 1〜4 行目で、5 行目以降が離れた行
    expect(foldedRanges(24, [mark("1")])).toEqual([])
    expect(foldedRanges(25, [mark("1")])).toEqual([{ start: 5, end: 25 }])
  })

  it("印が 2 か所なら間と両端をそれぞれ数える", () => {
    // 離れた行は 1〜6（6 行）・14〜36（23 行）・44〜60（17 行）で、畳むのは 20 行を超える真ん中だけ
    expect(foldedRanges(60, [mark("10"), mark("40")])).toEqual([{ start: 14, end: 36 }])
  })

  it("範囲の印は両端から 3 行を残す", () => {
    expect(foldedRanges(40, [mark("20-22")])).toEqual([])
    expect(foldedRanges(60, [mark("30-32")])).toEqual([
      { start: 1, end: 26 },
      { start: 36, end: 60 },
    ])
  })
})

describe("encodeMarks・splitMarksToken・decodeMarks", () => {
  const marks = [{ lines: "1-2", label: "空白 と 日本語 `x`" }]

  it("空白を含まない 1 語で往復する", () => {
    const token = encodeMarks(marks)
    expect(token).not.toMatch(/\s/)
    const { rest, marks: carried } = splitMarksToken(`src/a.ts ${token}`)
    expect(rest).toBe("src/a.ts")
    expect(decodeMarks(carried ?? "")).toEqual(marks)
  })

  it("marks だけの meta でもファイル名は空になり、marks の語が無ければそのまま", () => {
    expect(splitMarksToken(encodeMarks(marks)).rest).toBe("")
    expect(splitMarksToken(" src/a.ts ")).toEqual({ rest: "src/a.ts", marks: undefined })
  })

  it("壊れた語は空の印にする", () => {
    expect(decodeMarks("%E0%A4%A")).toEqual([])
    expect(decodeMarks(encodeURIComponent('{"lines":"1"}'))).toEqual([])
    expect(
      decodeMarks(encodeURIComponent('[{"lines":1,"label":"x"},{"lines":"2","label":"y"}]')),
    ).toEqual([{ lines: "2", label: "y" }])
  })
})
