import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import { plotBlockSchema } from "../../../../src/shared/report/figure-grammar.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

const plotOf = (...values: number[]) =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の問い",
    data: [{ name: "架空の量", type: "Q", values }],
    relation: "compare",
    fold: "",
    aside: "",
  })

const textBlock = (text: string): ReportBlock => ({ kind: "text", text, fold: "", aside: "" })

const sectionOf = (...blocks: ReportBlock[]) => ({ heading: "", blocks }) as const

const mismatchOf = (report: Parameters<typeof reportDraft>[0]) =>
  reportViolations(reportDraft(report)).filter(
    (violation) => violation.kind === "figure-number-mismatch",
  )

describe("figure-number-mismatch", () => {
  it("figure に置いた plot と結論の数が単位違いなら、位置だけを持つ違反になる", () => {
    expect(mismatchOf({ conclusion: "架空の所要は 1.2 だった。", figure: plotOf(1200) })).toEqual([
      { kind: "figure-number-mismatch", count: 1, faults: [{ plot: 1, column: 1, bodyNumber: 1 }] },
    ])
  })

  it("sections の plot と keyFigures の value がずれても数える", () => {
    expect(
      mismatchOf({
        conclusion: "架空の結論。",
        keyFigures: [{ before: "", value: "46", total: "", label: "架空", series: [], better: "" }],
        sections: [sectionOf(plotOf(45))],
      }),
    ).toEqual([
      { kind: "figure-number-mismatch", count: 1, faults: [{ plot: 1, column: 1, bodyNumber: 1 }] },
    ])
  })

  it("節の text の数がずれても数える", () => {
    expect(
      mismatchOf({
        conclusion: "架空の結論。",
        sections: [sectionOf(plotOf(45), textBlock("架空の根拠は 46 だった。"))],
      }),
    ).toHaveLength(1)
  })

  it("一致する回・plot の無い回・本文に数の無い回は違反にしない", () => {
    expect(mismatchOf({ conclusion: "架空の所要は 1,200 だった。", figure: plotOf(1200) })).toEqual(
      [],
    )
    expect(mismatchOf({ conclusion: "架空の所要は 1.2 だった。" })).toEqual([])
    expect(mismatchOf({ conclusion: "架空の結論。", figure: plotOf(1200) })).toEqual([])
  })

  it("無関係な数は違反にしない", () => {
    expect(mismatchOf({ conclusion: "架空の 3 件。", figure: plotOf(45, 90) })).toEqual([])
  })

  it("差し戻しの文面は位置だけで、本文の字を写さない", () => {
    const text = reportRejectionText(
      mismatchOf({ conclusion: "架空の秘密の語は 1.2 だった。", figure: plotOf(1200) }),
    )

    expect(text).toContain("1個目の plot の 1 列目と本文の 1 番目の数")
    expect(text).not.toContain("架空の秘密の語")
  })
})
