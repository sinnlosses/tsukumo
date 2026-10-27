// 決定表がヒストグラムを返した `plot` を、描画側が読む入力へ写す。階級幅は申告に無いのでここで決める。

import type { PlotFormResolution } from "./figure-decision.ts"
import type { ReportPlot } from "./figure-grammar.ts"
import { quantileOf } from "./plot-quantile.ts"

/** 階級の数の上限。 */
const BINS_MAX = 20

type HistogramBin = {
  readonly from: number
  readonly to: number
  readonly count: number
}

export type HistogramSpec = {
  readonly kind: "histogram"
  readonly title: string
  readonly unit: string
  readonly bins: readonly HistogramBin[]
  readonly median: number
  readonly min: number
  readonly max: number
}

/**
 * 量の列を階級に分け、中央値と範囲を添える。
 * 階級幅は Freedman–Diaconis の規則（2 × 四分位範囲 × 個数の -1/3 乗）で、階級数は 1〜20 に収める。
 * 四分位範囲が 0 か全部同じ値なら階級は 1 つ。写せない申告は表に落とすので `undefined`。
 */
export function plotHistogramOf(
  plot: ReportPlot,
  resolution: PlotFormResolution,
): HistogramSpec | undefined {
  if (resolution.form !== "histogram") return undefined
  const channels = resolution.decision.encoding.map((entry) => entry.channel)
  const quantityColumns = plot.data.filter((_, index) => channels[index] === "y")
  const [column] = quantityColumns
  if (column === undefined || quantityColumns.length !== 1) return undefined
  const values = column.values.filter((value): value is number => typeof value === "number")
  if (values.length !== column.values.length || values.length === 0) return undefined
  const sorted = values.toSorted((a, b) => a - b)
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? min
  return {
    kind: "histogram",
    title: plot.question,
    unit: column.name,
    bins: binsOf(sorted, min, max),
    median: quantileOf(sorted, 0.5),
    min,
    max,
  }
}

function binsOf(sorted: readonly number[], min: number, max: number): readonly HistogramBin[] {
  const iqr = quantileOf(sorted, 0.75) - quantileOf(sorted, 0.25)
  const range = max - min
  if (range === 0 || iqr === 0) return [{ from: min, to: max, count: sorted.length }]
  const width = 2 * iqr * Math.pow(sorted.length, -1 / 3)
  const count = Math.min(BINS_MAX, Math.max(1, Math.ceil(range / width)))
  const step = range / count
  return Array.from({ length: count }, (_, index) => ({
    from: min + step * index,
    to: min + step * (index + 1),
    count: sorted.filter((value) => binIndexOf(value, min, step, count) === index).length,
  }))
}

function binIndexOf(value: number, min: number, step: number, count: number): number {
  return Math.min(count - 1, Math.floor((value - min) / step))
}
