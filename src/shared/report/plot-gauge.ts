// 決定表が数直線・bullet を返した `plot` を、描画側が読む入力へ写す。座標・色は持たず、軸と位置は描画側が決める。

import type { PlotFormResolution } from "./figure-decision.ts"
import type { ReportPlot } from "./figure-grammar.ts"

type GaugeBand = {
  /** 区間の上端の値。下端は前の区間の上端（先頭は 0）。 */
  readonly upTo: number
}

type NumberLineSpec = {
  readonly kind: "numberLine"
  readonly title: string
  readonly unit: string
  readonly values: readonly number[]
}

type BulletRow = {
  readonly label: string
  readonly value: number
  readonly target: number
  /** 定性区間。1〜5 個。 */
  readonly bands: readonly GaugeBand[]
}

type BulletSpec = {
  readonly kind: "bullet"
  readonly title: string
  readonly unit: string
  readonly rows: readonly BulletRow[]
}

export type GaugeSpec = NumberLineSpec | BulletSpec

/**
 * 数直線は量の列の値を並べ、列の名前を単位にする。
 * bullet は量の 2 列を値と目標にし、区間は申告に無いので 0 から目標までの 1 つにする。
 * 写せない申告は表に落とすので `undefined`。
 */
export function plotGaugeOf(
  plot: ReportPlot,
  resolution: PlotFormResolution,
): GaugeSpec | undefined {
  const { form } = resolution
  if (form !== "numberLine" && form !== "bullet") return undefined
  const channels = resolution.decision.encoding.map((entry) => entry.channel)
  const labelColumns = plot.data.filter((_, index) => channels[index] !== "y")
  const quantityColumns = plot.data.filter((_, index) => channels[index] === "y")
  if (form === "numberLine") {
    const [column] = quantityColumns
    if (column === undefined || quantityColumns.length !== 1 || labelColumns.length !== 0) {
      return undefined
    }
    return {
      kind: "numberLine",
      title: plot.question,
      unit: column.name,
      values: numbersOf(column.values),
    }
  }
  const [labelColumn] = labelColumns
  const [valueColumn, targetColumn] = quantityColumns
  if (
    labelColumn === undefined ||
    labelColumns.length !== 1 ||
    valueColumn === undefined ||
    targetColumn === undefined ||
    quantityColumns.length !== 2
  ) {
    return undefined
  }
  const values = numbersOf(valueColumn.values)
  const targets = numbersOf(targetColumn.values)
  if (values.length !== labelColumn.values.length || targets.length !== values.length) {
    return undefined
  }
  return {
    kind: "bullet",
    title: plot.question,
    unit: valueColumn.name,
    rows: labelColumn.values.map((label, index) => ({
      label: String(label),
      value: values[index] ?? 0,
      target: targets[index] ?? 0,
      bands: [{ upTo: targets[index] ?? 0 }],
    })),
  }
}

function numbersOf(values: readonly (string | number)[]): readonly number[] {
  return values.filter((value): value is number => typeof value === "number")
}
