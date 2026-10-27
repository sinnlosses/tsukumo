import { describe, expect, it } from "vitest"

import { figureNumberSlips, numbersIn } from "../../../../src/server/report/core/figure-number.ts"
import { plotBlockSchema, type ReportPlot } from "../../../../src/shared/report/figure-grammar.ts"

type Column = { name: string; type: "N" | "O" | "T" | "Q"; values: (string | number)[] }

const plotOf = (...data: Column[]): ReportPlot =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の問い",
    data,
    relation: "compare",
    fold: "",
    aside: "",
  })

const quantity = (...values: number[]): Column => ({ name: "架空の量", type: "Q", values })

const slipsOf = (text: string, ...data: Column[]) =>
  figureNumberSlips([plotOf(...data)], numbersIn(text))

describe("numbersIn", () => {
  it("桁区切り・小数・% を 1 つの数として出現順に読む", () => {
    expect(numbersIn("1,234 と 12.5 と 45% と 7")).toEqual([
      { value: 1234, percent: false },
      { value: 12.5, percent: false },
      { value: 45, percent: true },
      { value: 7, percent: false },
    ])
  })

  it("インラインコードの中の数は読まない", () => {
    expect(numbersIn("`45` は読まず 3 は読む")).toEqual([{ value: 3, percent: false }])
  })

  it("数が無い文は空を返す", () => {
    expect(numbersIn("架空の文")).toEqual([])
  })
})

describe("figureNumberSlips", () => {
  it("同じ値は不一致にしない", () => {
    expect(slipsOf("12.5", quantity(12.5, 3))).toEqual([])
  })

  it("小数 2 桁までの丸めの差は不一致にしない", () => {
    expect(slipsOf("12.341", quantity(12.34))).toEqual([])
  })

  it("桁区切りは外して比べる", () => {
    expect(slipsOf("1,234", quantity(1234))).toEqual([])
  })

  it("% 表記は、そのままの値と 100 で割った値のどちらとも一致とみなす", () => {
    expect(slipsOf("45%", quantity(0.45))).toEqual([])
    expect(slipsOf("45%", quantity(45))).toEqual([])
  })

  it("単位違いは不一致として数える", () => {
    expect(slipsOf("1.2", quantity(1200))).toEqual([{ plot: 1, column: 1, bodyNumber: 1 }])
  })

  it("近い値の取り違えは不一致として数える", () => {
    expect(slipsOf("46", quantity(45, 90))).toEqual([{ plot: 1, column: 1, bodyNumber: 1 }])
  })

  it("どの列の値とも取り違えにならない数は数えない", () => {
    expect(slipsOf("3", quantity(45, 90))).toEqual([])
  })

  it("別の列で一致する数は数えない", () => {
    expect(slipsOf("46", quantity(45), quantity(46))).toEqual([])
  })

  it("0 は単位違いに数えない", () => {
    expect(slipsOf("0", quantity(0))).toEqual([])
    expect(slipsOf("0", quantity(5))).toEqual([])
  })

  it("本文に数が無ければ空を返す", () => {
    expect(figureNumberSlips([plotOf(quantity(45))], [])).toEqual([])
  })

  it("plot が無ければ空を返す", () => {
    expect(figureNumberSlips([], numbersIn("46"))).toEqual([])
  })

  it("Q 列の無い plot は照合しない", () => {
    expect(slipsOf("46", { name: "架空の名", type: "N", values: ["45"] })).toEqual([])
  })

  it("複数の plot・列・本文の数の位置を、与えた並びのまま返す", () => {
    const plots = [
      plotOf({ name: "架空の名", type: "N", values: ["a"] }, quantity(100)),
      plotOf(quantity(10, 20), quantity(5000, 4000)),
    ]
    const numbers = numbersIn("101 と 4,900 と 7")

    expect(figureNumberSlips(plots, numbers)).toEqual([
      { plot: 1, column: 2, bodyNumber: 1 },
      { plot: 2, column: 2, bodyNumber: 2 },
    ])
  })

  it("Q 列を N 列に替えると、集める側が壊れたとき落ちるよう空になる", () => {
    const asNominal = (column: Column): Column => ({
      ...column,
      type: "N",
      values: column.values.map(String),
    })
    const plots = [plotOf(asNominal(quantity(100))), plotOf(asNominal(quantity(5000, 4000)))]

    expect(figureNumberSlips(plots, numbersIn("101 と 4,900 と 7"))).toEqual([])
  })
})
