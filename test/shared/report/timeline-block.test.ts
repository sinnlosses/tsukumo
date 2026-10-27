import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../src/server/report/core/report-violation-check.ts"
import {
  parseReportFigure,
  parseReportSections,
  type ReportBlock,
} from "../../../src/shared/report/report-block.ts"
import { leafBlocksOf } from "../../../src/shared/report/row-panel-block.ts"
import { draft } from "../../fixture/report-draft-block.ts"
import { markdownOf } from "../../fixture/report-markdown.ts"

type Row = { name: string; start: string | number; end?: string | number }

const timeline = (rows: readonly Row[], emphasis: readonly string[] = []): unknown => ({
  kind: "timeline",
  title: "架空の所要",
  rows,
  events: [],
  emphasis,
  fold: "",
  aside: "",
})

const blockOf = (value: unknown): ReportBlock => {
  const parsed = parseReportSections([{ heading: "", shapeTag: "time", blocks: [value] }])
  const block = leafBlocksOf(parsed.sections[0]?.blocks ?? [])[0]
  if (block === undefined) throw new Error("timeline の塊が受け付けられなかった")
  return block
}

describe("timeline の受け付け", () => {
  it.each([
    ["HH:MM", "14:00", "14:30"],
    ["ISO", "2026-01-02T10:00:00", "2026-01-02T11:30:00"],
    ["分の数", 0, 45],
  ])("sections と figure の両方が %s の時刻を受け付ける", (_name, start, end) => {
    const value = timeline([{ name: "架空の工程", start, end }])
    expect(blockOf(value).kind).toBe("timeline")
    expect(parseReportFigure(value).kind).toBe("timeline")
  })

  it("図 1 の題つきで timeline の包みを出す", () => {
    const html = markdownOf(
      blockOf(timeline([{ name: "架空の工程", start: "14:00", end: "14:30" }])),
    )
    expect(html).toContain("図 1")
    expect(html).toContain('class="timeline"')
  })
})

describe("timeline の入口の検査", () => {
  const kindsOf = (value: unknown): readonly string[] =>
    reportViolations(draft([blockOf(value)])).map((violation) => violation.kind)

  it("正しい塊は差し戻さない", () => {
    expect(kindsOf(timeline([{ name: "甲", start: "14:00", end: "14:10" }], ["甲"]))).toEqual([])
  })

  it.each([
    [
      "昇順でない",
      [
        { name: "甲", start: "14:20", end: "14:30" },
        { name: "乙", start: "14:00", end: "14:10" },
      ],
      [],
    ],
    ["終了が開始より前", [{ name: "甲", start: "14:30", end: "14:10" }], []],
    ["emphasis の名前が行に無い", [{ name: "甲", start: "14:00", end: "14:10" }], ["丙"]],
  ] as const)("%s なら broken-timeline で差し戻す", (_name, rows, emphasis) => {
    expect(kindsOf(timeline(rows, emphasis))).toEqual(["broken-timeline"])
  })

  it("文面は位置だけを持ち、行の名前と時刻の字を出さない", () => {
    const text = reportRejectionText(
      reportViolations(
        draft([blockOf(timeline([{ name: "秘密の工程", start: "14:30", end: "14:10" }]))]),
      ),
    )
    expect(text).toContain("1個目の `timeline` の 1 行目")
    expect(text).not.toContain("秘密")
    expect(text).not.toContain("14:30")
  })
})
