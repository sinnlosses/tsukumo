import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import { plotBlockSchema } from "../../../../src/shared/report/figure-grammar.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

/** 架空の工程 5 つの所要。決定表は `part` の行で `bar`（文派は `table`）を返す。 */
const partPlot = (form: string | undefined) =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の工程のどれが所要の大半か",
    data: [
      { name: "架空の工程", type: "N", values: ["甲", "乙", "丙", "丁", "戊"] },
      { name: "分", type: "Q", values: [4, 31, 12, 9, 3] },
    ],
    relation: "part",
    ...(form === undefined ? {} : { form }),
  })

const sectionOf = (...blocks: ReportBlock[]) =>
  ({ heading: "", shapeTag: "unspecified", blocks }) as const

const plotFormViolationsOf = (report: Parameters<typeof reportDraft>[0]) =>
  reportViolations(reportDraft(report)).filter(
    (violation) =>
      violation.kind === "plot-forbidden-form" || violation.kind === "plot-form-override",
  )

describe("plot の form", () => {
  it("省いた form は auto として読む", () => {
    expect(partPlot(undefined).form).toBe("auto")
  })

  it("auto と決定表と同じ形は数えない", () => {
    expect(plotFormViolationsOf({ figure: partPlot(undefined) })).toEqual([])
    expect(plotFormViolationsOf({ sections: [sectionOf(partPlot("bar"))] })).toEqual([])
  })

  it("置いてはならない形は、当たった規則の名前つきで数える", () => {
    expect(plotFormViolationsOf({ figure: partPlot("pie") })).toEqual([
      { kind: "plot-forbidden-form", count: 1, rules: ["crowded-pie"] },
    ])
  })

  it("どちらの既定の形とも違う形は、上書きとして数える", () => {
    expect(plotFormViolationsOf({ sections: [sectionOf(partPlot("numberLine"))] })).toEqual([
      { kind: "plot-form-override", count: 1 },
    ])
  })

  it("文派の既定で決まる形（表）は上書きに数えない", () => {
    expect(plotFormViolationsOf({ figure: partPlot("table") })).toEqual([])
  })

  it("差し戻しの文面は規則の名前だけで、申告の値を写さない", () => {
    const text = reportRejectionText(plotFormViolationsOf({ figure: partPlot("pie") }))
    expect(text).toContain("crowded-pie")
    expect(text).not.toContain("架空の工程")
  })
})
