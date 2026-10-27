import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import { plotBlockSchema } from "../../../../src/shared/report/figure-grammar.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

const plotOf = (question: string, form?: string) =>
  plotBlockSchema.parse({
    kind: "plot",
    question,
    data: [
      { name: "架空の工程", type: "N", values: ["甲", "乙", "丙", "丁", "戊"] },
      { name: "分", type: "Q", values: [4, 31, 12, 9, 3] },
    ],
    relation: "part",
    ...(form === undefined ? {} : { form }),
  })

const titleViolationsOf = (...questions: readonly [string, string?][]) =>
  reportViolations(
    reportDraft({
      sections: [
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: questions.map(([question, form]) => plotOf(question, form)),
        },
      ],
    }),
  ).filter((violation) => violation.kind === "plot-title-without-number")

describe("plot の題の数", () => {
  it("数が無い題の図は数える", () => {
    expect(titleViolationsOf(["どの工程が大半か"], ["別の題"])).toEqual([
      { kind: "plot-title-without-number", count: 2 },
    ])
  })

  it("半角・全角どちらの数字でも数がある題は数えない", () => {
    expect(titleViolationsOf(["乙が 31 分で最長"], ["乙が３１分で最長"])).toEqual([])
  })

  it("表で描く形は題に数が無くても数えない", () => {
    expect(titleViolationsOf(["どの工程が大半か", "table"])).toEqual([])
  })

  it("数直線・bullet で描く形は題に数が無くても数えない", () => {
    const declarations = [
      {
        relation: "distribution",
        data: [{ name: "分", type: "Q", values: [4, 31, 12] }],
      },
      {
        relation: "compare",
        data: [
          { name: "項目", type: "N", values: ["甲", "乙"] },
          { name: "実績", type: "Q", values: [7, 12] },
          { name: "目標", type: "Q", values: [10, 10] },
        ],
      },
    ]
    for (const declaration of declarations) {
      const plot = plotBlockSchema.parse({ kind: "plot", question: "架空の題", ...declaration })
      const violations = reportViolations(
        reportDraft({
          sections: [{ heading: "", shapeTag: "unspecified", blocks: [plot] }],
        }),
      ).filter((violation) => violation.kind === "plot-title-without-number")
      expect(violations).toEqual([])
    }
  })

  it("散布図・ヒストグラムで描く形は題に数が無くても数えず、表に落ちた散布も数えない", () => {
    const rows = Array.from({ length: 12 }, (_, i) => i)
    const declarations = [
      {
        relation: "correlate",
        data: [
          { name: "件数", type: "Q", values: rows },
          { name: "分", type: "Q", values: rows },
        ],
      },
      {
        relation: "correlate",
        data: [
          { name: "件数", type: "Q", values: [...rows.slice(1), 500] },
          { name: "分", type: "Q", values: [...rows.slice(1), 900] },
        ],
      },
      {
        relation: "distribution",
        data: [{ name: "分", type: "Q", values: Array.from({ length: 25 }, (_, i) => i) }],
      },
    ]
    for (const declaration of declarations) {
      const plot = plotBlockSchema.parse({ kind: "plot", question: "架空の題", ...declaration })
      const violations = reportViolations(
        reportDraft({
          sections: [{ heading: "", shapeTag: "unspecified", blocks: [plot] }],
        }),
      ).filter((violation) => violation.kind === "plot-title-without-number")
      expect(violations).toEqual([])
    }
  })

  it("決定表が棒を返しても表に落ちる申告は、題に数が無くても数えない", () => {
    const names = ["甲", "乙", "丙", "丁"]
    const dropped = [
      // range で N 1 列・T 2 列（ラベルの列が 3 つになる）
      {
        relation: "range",
        data: [
          { name: "段", type: "N", values: names },
          { name: "始", type: "T", values: names },
          { name: "終", type: "T", values: names },
        ],
      },
      // N が 2 列（ラベルの列が 2 つ）で form に bar を書いた
      {
        relation: "compare",
        form: "bar",
        data: [
          { name: "段", type: "N", values: names },
          { name: "別", type: "N", values: names },
          { name: "分", type: "Q", values: [1, 2, 3, 4] },
        ],
      },
      // Q が 0 列で form に bar を書いた
      {
        relation: "compare",
        form: "bar",
        data: [
          { name: "段", type: "N", values: names },
          { name: "別", type: "N", values: names },
        ],
      },
    ]
    for (const declaration of dropped) {
      const plot = plotBlockSchema.parse({ kind: "plot", question: "架空の題", ...declaration })
      const violations = reportViolations(
        reportDraft({
          sections: [{ heading: "", shapeTag: "unspecified", blocks: [plot] }],
        }),
      ).filter((violation) => violation.kind === "plot-title-without-number")
      expect(violations).toEqual([])
    }
  })

  it("差し戻しの文面に個数が出て、題の中身は写さない", () => {
    const text = reportRejectionText(titleViolationsOf(["架空の題"]))
    expect(text).toContain("1個")
    expect(text).not.toContain("架空の題")
  })
})
