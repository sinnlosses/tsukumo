import { describe, expect, it } from "vitest"

import { plotFormOf } from "../../../src/shared/report/figure-decision.ts"
import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import { plotHistogramOf } from "../../../src/shared/report/plot-histogram.ts"

const ROWS = 25

const plotOf = (values: readonly number[]) =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の題 3 件",
    data: [{ name: "分", type: "Q", values }],
    relation: "distribution",
  })

const histogramOf = (plot: ReturnType<typeof plotOf>) =>
  plotHistogramOf(plot, plotFormOf(plot, plot.form, "chart"))

describe("plotHistogramOf", () => {
  it("全部同じ値なら階級は 1 つで、中央値と範囲が同じ値になる", () => {
    const spec = histogramOf(plotOf(Array.from({ length: ROWS }, () => 7)))
    expect(spec?.bins).toEqual([{ from: 7, to: 7, count: ROWS }])
    expect(spec?.median).toBe(7)
    expect([spec?.min, spec?.max]).toEqual([7, 7])
  })

  it("四分位範囲が 0 でも外れ値があれば範囲に含め、階級は 1 つ", () => {
    const spec = histogramOf(plotOf([...Array.from({ length: ROWS - 1 }, () => 7), 90]))
    expect(spec?.bins).toHaveLength(1)
    expect(spec?.max).toBe(90)
  })

  it("階級の個数の合計は値の個数で、階級数は 1〜20 に収まる", () => {
    const spec = histogramOf(plotOf(Array.from({ length: ROWS }, (_, i) => i * i)))
    const total = spec?.bins.reduce((sum, bin) => sum + bin.count, 0)
    expect(total).toBe(ROWS)
    expect(spec?.bins.length).toBeGreaterThan(1)
    expect(spec?.bins.length).toBeLessThanOrEqual(20)
    expect(spec?.median).toBe(144)
    expect([spec?.min, spec?.max]).toEqual([0, 576])
  })

  it("形がヒストグラムでなければ undefined", () => {
    const plot = plotOf([4, 31, 12])
    expect(histogramOf(plot)).toBeUndefined()
  })
})
