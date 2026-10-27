import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../src/server/report/core/report-usage.ts"
import {
  parseReportFigure,
  parseReportSections,
  type ReportBlock,
} from "../../../src/shared/report/report-block.ts"
import { reportOfSections } from "../../fixture/report-event.ts"
import { markdownOf } from "../../fixture/report-markdown.ts"

const plot = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "plot",
  question: "架空の三つの工程のどれを先に縮めるか",
  data: [
    { name: "工程", type: "N", values: ["甲", "乙", "丙"] },
    { name: "分", type: "Q", values: [12, 30, 7] },
  ],
  relation: "rank",
  fold: "",
  aside: "",
  ...overrides,
})

const parseInSections = (value: unknown) =>
  parseReportSections([{ heading: "", shapeTag: "quantity", blocks: [value] }])

const firstBlock = (value: unknown): unknown => parseInSections(value).sections[0]?.blocks[0]

/** 入れ子の中の文字・数の葉を、深さを問わず並びで集める。 */
function leavesOf(value: unknown): readonly (string | number)[] {
  if (typeof value === "string" || typeof value === "number") return [value]
  if (Array.isArray(value)) return value.flatMap(leavesOf)
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(leavesOf)
  return []
}

/** 入力の葉のうち、出力に（重複を含めて）残っていないもの。 */
function missingLeaves(input: unknown, output: unknown): readonly (string | number)[] {
  const remaining = [...leavesOf(output)]
  return leavesOf(input).filter((leaf) => {
    const index = remaining.indexOf(leaf)
    if (index === -1) return true
    remaining.splice(index, 1)
    return false
  })
}

describe("plot の受け付け", () => {
  it("sections と figure の両方が申告を受け付ける", () => {
    expect(firstBlock(plot())).toMatchObject({ kind: "plot", relation: "rank" })
    expect(parseReportFigure(plot()).kind).toBe("plot")
  })

  it("申告の要素は、保持した値に全部残る", () => {
    const input = plot()
    expect(missingLeaves(input, firstBlock(input))).toEqual([])
  })

  it("要素が欠けた出力は、残っていない葉として見つかる", () => {
    const input = plot()
    const dropped = plot({
      data: [
        { name: "工程", type: "N", values: ["甲", "乙"] },
        { name: "分", type: "Q", values: [12, 30, 7] },
      ],
    })
    expect(missingLeaves(input, dropped)).toEqual(["丙"])
  })

  it.each([
    ["Q の列に文字", [{ name: "分", type: "Q", values: ["多い", 3, 4] }]],
    [
      "列の長さの不一致",
      [
        { name: "工程", type: "N", values: ["甲", "乙"] },
        { name: "分", type: "Q", values: [1, 2, 3] },
      ],
    ],
  ])("%s は schema で落ちる", (_name, data) => {
    expect(firstBlock(plot({ data }))).toBeUndefined()
  })

  it.each([
    ["relation が8語の外", { relation: "pie" }],
    ["question が空", { question: "" }],
    ["question が60字を超える", { question: "あ".repeat(61) }],
    ["列が1つも無い", { data: [] }],
  ])("%s は schema で落ちる", (_name, overrides) => {
    expect(firstBlock(plot(overrides))).toBeUndefined()
  })

  it("form に table を書くと表として描かれ、題は表の番号つきで question、列名と行は data から起こす", () => {
    const block = parseInSections(plot({ form: "table" })).sections[0]?.blocks[0]
    if (block === undefined) throw new Error("plot の塊が受け付けられなかった")

    const table: ReportBlock = {
      kind: "table",
      title: "架空の三つの工程のどれを先に縮めるか",
      columns: ["工程", "分"],
      rows: [
        ["甲", "12"],
        ["乙", "30"],
        ["丙", "7"],
      ],
      rest: "",
      fold: "",
      aside: "",
    }
    const html = markdownOf(block)
    expect(html).toBe(markdownOf(table))
    expect(html).toContain("表 1")
    expect(html).toContain("丙")
  })

  it.each([["bar"]])("form に %s を書いても、決定表と同じ形なら省いたときと同じに描く", (form) => {
    const block = parseInSections(plot({ form })).sections[0]?.blocks[0]
    const auto = parseInSections(plot()).sections[0]?.blocks[0]
    if (block === undefined || auto === undefined) {
      throw new Error("plot の塊が受け付けられなかった")
    }

    expect(markdownOf(block)).toBe(markdownOf(auto))
  })

  it("form が形の語彙の外なら schema で落ちる", () => {
    expect(firstBlock(plot({ form: "donut" }))).toBeUndefined()
  })

  it("使用量の記録の blockKinds に plot が出る", () => {
    const block = parseInSections(plot()).sections[0]?.blocks[0]
    if (block === undefined) throw new Error("plot の塊が受け付けられなかった")

    const entry = reportUsageEntryOf(
      reportOfSections([{ heading: "架空の節", shapeTag: "quantity", blocks: [block] }]),
      "claude-session-1",
      1_000,
      false,
    )
    expect(entry.blockKinds).toEqual(["plot"])
  })

  it("question はちょうど60字まで受け付ける", () => {
    expect(firstBlock(plot({ question: "あ".repeat(60) }))).toBeDefined()
  })
})
