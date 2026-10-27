// 決定表が散布を返した `plot` を、描画側が読む入力へ写す。座標・色は持たず、軸と位置は描画側が決める。

import type { PlotFormResolution } from "./figure-decision.ts"
import type { ReportPlot } from "./figure-grammar.ts"
import { quantileOf } from "./plot-quantile.ts"

/** 四分位範囲のこの倍数より外にある値を外れ値とする。 */
const FENCE_FACTOR = 1.5

type ScatterPoint = {
  readonly x: number
  readonly y: number
  /** 名前の列が無ければ空。 */
  readonly label: string
  /** x か y が四分位範囲の柵の外にある点。 */
  readonly outlier: boolean
}

export type ScatterSpec = {
  readonly kind: "scatter"
  readonly title: string
  readonly xName: string
  readonly yName: string
  readonly points: readonly ScatterPoint[]
}

/**
 * 先頭の量の列を x、次を y にし、名前の列があれば点の名前にする。
 * 外れ値は必ず名前を添えるので、外れ値があるのに名前の列が無い申告は写せない。
 * 写せない申告は表に落とすので `undefined`。
 */
export function plotScatterOf(
  plot: ReportPlot,
  resolution: PlotFormResolution,
): ScatterSpec | undefined {
  if (resolution.form !== "scatter") return undefined
  const channels = resolution.decision.encoding.map((entry) => entry.channel)
  const xColumns = plot.data.filter((_, index) => channels[index] === "x")
  const yColumns = plot.data.filter((_, index) => channels[index] === "y")
  const labelColumns = plot.data.filter((_, index) => channels[index] === "label")
  const [xColumn] = xColumns
  const [yColumn] = yColumns
  if (
    xColumn === undefined ||
    yColumn === undefined ||
    xColumns.length !== 1 ||
    yColumns.length !== 1 ||
    labelColumns.length > 1
  ) {
    return undefined
  }
  const xs = numbersOf(xColumn.values)
  const ys = numbersOf(yColumn.values)
  const [labelColumn] = labelColumns
  if (
    xs === undefined ||
    ys === undefined ||
    xs.length !== ys.length ||
    (labelColumn !== undefined && labelColumn.values.length !== xs.length)
  ) {
    return undefined
  }
  const xFence = fenceOf(xs)
  const yFence = fenceOf(ys)
  const points = xs.map((x, index) => {
    const y = ys[index] ?? 0
    return {
      x,
      y,
      label: labelColumn === undefined ? "" : String(labelColumn.values[index]),
      outlier: outside(xFence, x) || outside(yFence, y),
    }
  })
  if (points.some((point) => point.outlier) && labelColumn === undefined) return undefined
  return {
    kind: "scatter",
    title: plot.question,
    xName: xColumn.name,
    yName: yColumn.name,
    points,
  }
}

type Fence = { readonly low: number; readonly high: number }

function fenceOf(values: readonly number[]): Fence {
  const sorted = values.toSorted((a, b) => a - b)
  const first = quantileOf(sorted, 0.25)
  const third = quantileOf(sorted, 0.75)
  const reach = (third - first) * FENCE_FACTOR
  return { low: first - reach, high: third + reach }
}

function outside(fence: Fence, value: number): boolean {
  return value < fence.low || value > fence.high
}

function numbersOf(values: readonly (string | number)[]): readonly number[] | undefined {
  const numbers = values.filter((value): value is number => typeof value === "number")
  return numbers.length === values.length ? numbers : undefined
}
