import { describe, expect, it } from "vitest"

import { plotFormOf } from "../../../src/shared/report/figure-decision.ts"
import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import { plotGaugeOf } from "../../../src/shared/report/plot-gauge.ts"

const plotOf = (relation: string, data: unknown[], form?: string) =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の題 3 件",
    data,
    relation,
    ...(form === undefined ? {} : { form }),
  })

const gaugeOf = (plot: ReturnType<typeof plotOf>) =>
  plotGaugeOf(plot, plotFormOf(plot, plot.form, "chart"))

describe("plotGaugeOf", () => {
  it("数直線は量の列の値を並べ、列の名前を単位にする", () => {
    const plot = plotOf("distribution", [{ name: "分", type: "Q", values: [4, 31, 12] }])
    expect(gaugeOf(plot)).toEqual({
      kind: "numberLine",
      title: "架空の題 3 件",
      unit: "分",
      values: [4, 31, 12],
    })
  })

  it("bullet は名前・値・目標を行にし、区間は 0 から目標までの 1 つ", () => {
    const plot = plotOf("compare", [
      { name: "項目", type: "N", values: ["甲", "乙"] },
      { name: "実績", type: "Q", values: [7, 12] },
      { name: "目標", type: "Q", values: [10, 10] },
    ])
    expect(gaugeOf(plot)).toEqual({
      kind: "bullet",
      title: "架空の題 3 件",
      unit: "実績",
      rows: [
        { label: "甲", value: 7, target: 10, bands: [{ upTo: 10 }] },
        { label: "乙", value: 12, target: 10, bands: [{ upTo: 10 }] },
      ],
    })
  })

  it("形が数直線・bullet でなければ undefined", () => {
    const plot = plotOf("part", [
      { name: "工程", type: "N", values: ["甲", "乙", "丙"] },
      { name: "分", type: "Q", values: [4, 31, 12] },
    ])
    expect(gaugeOf(plot)).toBeUndefined()
  })

  it("書き手が bullet を選んでも量が 1 列だけなら undefined", () => {
    const plot = plotOf(
      "compare",
      [
        { name: "項目", type: "N", values: ["甲", "乙", "丙"] },
        { name: "分", type: "Q", values: [4, 31, 12] },
      ],
      "bullet",
    )
    expect(gaugeOf(plot)).toBeUndefined()
  })
})
