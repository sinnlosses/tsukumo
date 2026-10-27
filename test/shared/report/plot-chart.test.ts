import { describe, expect, it } from "vitest"

import { plotFormOf } from "../../../src/shared/report/figure-decision.ts"
import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import { plotChartOf } from "../../../src/shared/report/plot-chart.ts"

type Column = { name: string; type: "N" | "O" | "T" | "Q"; values: (string | number)[] }

const names = (count: number) => Array.from({ length: count }, (_, i) => `項${String(i + 1)}`)
const numbers = (count: number, base = 1) => Array.from({ length: count }, (_, i) => base + i * 3)

const plotOf = (relation: string, data: Column[], form?: string) =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の題 3 件",
    data,
    relation,
    ...(form === undefined ? {} : { form }),
  })

const chartOf = (plot: ReturnType<typeof plotOf>) =>
  plotChartOf(plot, plotFormOf(plot, plot.form, "chart"))

describe("plotChartOf", () => {
  it("a: 5 行の part は横棒", () => {
    const plot = plotOf("part", [
      { name: "工程", type: "N", values: names(5) },
      { name: "分", type: "Q", values: numbers(5) },
    ])
    expect(chartOf(plot)).toMatchObject({
      chartKind: "bar",
      labels: names(5),
      series: [{ name: "分", values: numbers(5) }],
      horizontal: true,
      title: "架空の題 3 件",
    })
  })

  it("b: 3 行の compare は縦棒", () => {
    const plot = plotOf("compare", [
      { name: "工程", type: "N", values: names(3) },
      { name: "分", type: "Q", values: numbers(3) },
    ])
    expect(chartOf(plot)).toMatchObject({ chartKind: "bar", horizontal: false })
  })

  it("c・d: 時間の列を labels に、量の列を系列にした折れ線", () => {
    const one = plotOf("trend", [
      { name: "日", type: "T", values: names(5) },
      { name: "件", type: "Q", values: numbers(5) },
    ])
    expect(chartOf(one)).toMatchObject({ chartKind: "line", labels: names(5) })
    const three = plotOf("trend", [
      { name: "日", type: "T", values: names(5) },
      { name: "甲", type: "Q", values: numbers(5) },
      { name: "乙", type: "Q", values: numbers(5, 2) },
      { name: "丙", type: "Q", values: numbers(5, 3) },
    ])
    expect(chartOf(three)?.series.map((series) => series.name)).toEqual(["甲", "乙", "丙"])
  })

  it("e: 前と後の量を持つ change の折れ線は slope", () => {
    const plot = plotOf("change", [
      { name: "項目", type: "N", values: names(3) },
      { name: "前", type: "Q", values: numbers(3) },
      { name: "後", type: "Q", values: numbers(3, 2) },
    ])
    expect(chartOf(plot)).toMatchObject({ chartKind: "slope", labels: names(3) })
  })

  it("f: 3 行の円は先頭の量だけ", () => {
    const plot = plotOf(
      "part",
      [
        { name: "項目", type: "N", values: names(3) },
        { name: "件", type: "Q", values: numbers(3) },
        { name: "別", type: "Q", values: numbers(3, 2) },
      ],
      "pie",
    )
    expect(chartOf(plot)).toMatchObject({ chartKind: "pie" })
  })

  it("g・h: 量 2 列の range は span、時間 2 列の range は表", () => {
    const quantities = plotOf("range", [
      { name: "段", type: "N", values: names(4) },
      { name: "始", type: "Q", values: numbers(4) },
      { name: "終", type: "Q", values: numbers(4, 2) },
    ])
    expect(chartOf(quantities)).toMatchObject({ chartKind: "span" })
    const times = plotOf("range", [
      { name: "段", type: "N", values: names(4) },
      { name: "始", type: "T", values: names(4) },
      { name: "終", type: "T", values: names(4) },
    ])
    expect(chartOf(times)).toBeUndefined()
  })

  it("i・j: 描き方の無い形と、置けない円は chart にならない", () => {
    const table = plotOf(
      "part",
      [
        { name: "項目", type: "N", values: names(5) },
        { name: "件", type: "Q", values: numbers(5) },
      ],
      "table",
    )
    expect(chartOf(table)).toBeUndefined()
    const crowdedPie = plotOf(
      "part",
      [
        { name: "項目", type: "N", values: names(5) },
        { name: "件", type: "Q", values: numbers(5) },
      ],
      "pie",
    )
    expect(chartOf(crowdedPie)?.chartKind).toBe("bar")
  })

  it("申告の全列の名前と値が、labels・系列名・系列の値に全部残る", () => {
    const data: Column[] = [
      { name: "日", type: "T", values: names(6) },
      { name: "甲", type: "Q", values: numbers(6) },
      { name: "乙", type: "Q", values: numbers(6, 2) },
    ]
    const chart = chartOf(plotOf("trend", data))
    const kept = [
      ...(chart?.labels ?? []),
      ...(chart?.series.flatMap((series) => [series.name, ...series.values.map(String)]) ?? []),
    ]
    const expected = data
      .filter((column) => column.type !== "T")
      .flatMap((column) => [column.name, ...column.values.map(String)])
      .concat(data[0]?.values.map(String) ?? [])
    expect([...kept].toSorted()).toEqual([...expected].toSorted())
    // 値が 1 つ欠けたら見つかる
    expect(kept.slice(1).toSorted()).not.toEqual([...expected].toSorted())
  })
})
