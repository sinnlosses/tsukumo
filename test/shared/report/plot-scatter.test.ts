import { describe, expect, it } from "vitest"

import { plotFormOf } from "../../../src/shared/report/figure-decision.ts"
import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import { plotScatterOf } from "../../../src/shared/report/plot-scatter.ts"

const ROWS = 12
const series = (value: (index: number) => number) =>
  Array.from({ length: ROWS }, (_, i) => value(i))

const plotOf = (data: unknown[], relation = "correlate") =>
  plotBlockSchema.parse({ kind: "plot", question: "架空の題 3 件", data, relation })

const scatterOf = (plot: ReturnType<typeof plotOf>) =>
  plotScatterOf(plot, plotFormOf(plot, plot.form, "chart"))

const outliersOf = (spec: ReturnType<typeof scatterOf>) =>
  (spec?.points ?? []).flatMap((point, index) => (point.outlier ? [index] : []))

describe("plotScatterOf", () => {
  it("先頭の量を x、次を y にして点を並べる", () => {
    const plot = plotOf([
      { name: "件数", type: "Q", values: series((i) => i) },
      { name: "分", type: "Q", values: series((i) => i * 2) },
    ])
    const spec = scatterOf(plot)
    expect(spec?.xName).toBe("件数")
    expect(spec?.yName).toBe("分")
    expect(spec?.points).toHaveLength(ROWS)
    expect(spec?.points[3]).toEqual({ x: 3, y: 6, label: "", outlier: false })
    expect(outliersOf(spec)).toEqual([])
  })

  it("x が全部同じ値でも外れ値は出ない", () => {
    const plot = plotOf([
      { name: "件数", type: "Q", values: series(() => 5) },
      { name: "分", type: "Q", values: series((i) => i) },
    ])
    expect(outliersOf(scatterOf(plot))).toEqual([])
  })

  it("全部同じ値の点でも写せる", () => {
    const plot = plotOf([
      { name: "件数", type: "Q", values: series(() => 5) },
      { name: "分", type: "Q", values: series(() => 5) },
    ])
    expect(outliersOf(scatterOf(plot))).toEqual([])
  })

  const outlierPlot = (names: readonly string[]) =>
    plotOf([
      { name: "名前", type: "N", values: names },
      { name: "件数", type: "Q", values: [...series((i) => i).slice(1), 500] },
      { name: "分", type: "Q", values: [...series((i) => i).slice(1), 900] },
    ])
  const unique = series((i) => i).map((i) => `点${String(i)}`)

  it("外れ値が 1 点あればその点だけに印が付く", () => {
    expect(outliersOf(scatterOf(outlierPlot(unique)))).toEqual([11])
  })

  it("名前が重なっていても、印は外れた点だけに付く", () => {
    const names = [...unique.slice(0, 11), "点0"]
    expect(outliersOf(scatterOf(outlierPlot(names)))).toEqual([11])
  })

  it("外れ値の名前が空でも印は付く", () => {
    const names = [...unique.slice(0, 11), ""]
    expect(outliersOf(scatterOf(outlierPlot(names)))).toEqual([11])
  })

  it("外れ値が複数で名前が重なっていても、印は外れた点の数だけ付く", () => {
    const plot = plotOf([
      { name: "名前", type: "N", values: Array.from({ length: ROWS }, () => "同じ") },
      { name: "件数", type: "Q", values: [...series((i) => i).slice(2), 500, 600] },
      { name: "分", type: "Q", values: [...series((i) => i).slice(2), 900, 950] },
    ])
    expect(outliersOf(scatterOf(plot))).toEqual([10, 11])
  })

  it("外れ値があるのに名前の列が無ければ undefined", () => {
    const plot = plotOf([
      { name: "件数", type: "Q", values: [...series((i) => i).slice(1), 500] },
      { name: "分", type: "Q", values: [...series((i) => i).slice(1), 900] },
    ])
    expect(scatterOf(plot)).toBeUndefined()
  })

  it("形が散布でなければ undefined", () => {
    const plot = plotOf([{ name: "分", type: "Q", values: [4, 31, 12] }], "distribution")
    expect(scatterOf(plot)).toBeUndefined()
  })
})
