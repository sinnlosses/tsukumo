import { describe, expect, it } from "vitest"

import { excerptLines } from "../../../../src/server/repository/core/file-excerpt.ts"
import {
  MAX_EXCERPT_LINE_LENGTH,
  MAX_EXCERPT_LINES,
} from "../../../../src/shared/repository/file-excerpt.ts"

/** 「架空の行 1」から「架空の行 n」までの n 行（末尾に改行）。 */
function numberedText(count: number): string {
  return Array.from({ length: count }, (_, index) => `架空の行 ${index + 1}\n`).join("")
}

function numbersOf(excerpt: ReturnType<typeof excerptLines>): readonly number[] {
  return excerpt.kind === "lines" ? excerpt.lines.map((line) => line.number) : []
}

describe("excerptLines", () => {
  it("1行を指したら前後3行を、行番号と字の並びで返す", () => {
    const excerpt = excerptLines(numberedText(20), { startLine: 12, endLine: 12 })

    expect(excerpt).toEqual({
      kind: "lines",
      lines: [9, 10, 11, 12, 13, 14, 15].map((number) => ({
        number,
        text: `架空の行 ${number}`,
        truncated: false,
      })),
    })
  })

  it("ファイルの頭と末尾では、はみ出した分を切り詰める", () => {
    expect(numbersOf(excerptLines(numberedText(20), { startLine: 2, endLine: 2 }))).toEqual([
      1, 2, 3, 4, 5,
    ])
    expect(numbersOf(excerptLines(numberedText(20), { startLine: 20, endLine: 20 }))).toEqual([
      17, 18, 19, 20,
    ])
  })

  it("範囲を指したら範囲の前後1行を返し、長い範囲は上限の行数で切る", () => {
    expect(numbersOf(excerptLines(numberedText(40), { startLine: 10, endLine: 14 }))).toEqual([
      9, 10, 11, 12, 13, 14, 15,
    ])

    const long = numbersOf(excerptLines(numberedText(40), { startLine: 10, endLine: 35 }))
    expect(long).toHaveLength(MAX_EXCERPT_LINES)
    expect(long[0]).toBe(9)
  })

  it("指した行の頭がファイルの行数を超えたら out-of-range と行数を返す", () => {
    expect(excerptLines(numberedText(5), { startLine: 6, endLine: 6 })).toEqual({
      kind: "out-of-range",
      lineCount: 5,
    })
    expect(excerptLines("", { startLine: 1, endLine: 1 })).toEqual({
      kind: "out-of-range",
      lineCount: 0,
    })
  })

  it("範囲の終わりだけがはみ出したら、ある行までを返す", () => {
    expect(numbersOf(excerptLines(numberedText(5), { startLine: 4, endLine: 9 }))).toEqual([
      3, 4, 5,
    ])
  })

  it("CRLF の改行は字に残さない", () => {
    const excerpt = excerptLines("架空の一\r\n架空の二\r\n", { startLine: 1, endLine: 1 })

    expect(excerpt).toEqual({
      kind: "lines",
      lines: [
        { number: 1, text: "架空の一", truncated: false },
        { number: 2, text: "架空の二", truncated: false },
      ],
    })
  })

  it("長い行は上限の字数（コードポイント）で切り、切ったことを立てる", () => {
    const wide = "😀".repeat(MAX_EXCERPT_LINE_LENGTH + 5)
    const fit = "あ".repeat(MAX_EXCERPT_LINE_LENGTH)
    const excerpt = excerptLines(`${wide}\n${fit}\n`, { startLine: 1, endLine: 1 })

    expect(excerpt).toEqual({
      kind: "lines",
      lines: [
        { number: 1, text: "😀".repeat(MAX_EXCERPT_LINE_LENGTH), truncated: true },
        { number: 2, text: fit, truncated: false },
      ],
    })
  })
})
