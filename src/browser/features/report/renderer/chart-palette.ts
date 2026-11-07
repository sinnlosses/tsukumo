// グラフの系列・データ点に配る色を決める。色の並びは呼び出し側が読んで渡す。

import type { ReportChartTone } from "../../../../shared/report/report-block-diagram.ts"

export type ChartPalette = {
  readonly series: readonly string[]
  readonly other: string
  readonly muted: string
  readonly states: Readonly<Record<Exclude<ReportChartTone, "none">, string>>
}

type DatasetColors = {
  readonly backgroundColor: string | readonly string[]
  readonly borderColor: string | readonly string[]
}

type DatasetShape = {
  readonly type?: string
  readonly data?: readonly unknown[]
  readonly backgroundColor?: unknown
  readonly borderColor?: unknown
}

/**
 * 系列 `index` に配る色。色を持つ系列は `undefined`（書き手の指定を上書きしない）。
 * 円は系列の色ではなくデータ点ごとに配る。パレットを使い切ったら `other`。
 */
export function colorsForDataset(
  dataset: DatasetShape,
  chartType: string,
  index: number,
  palette: ChartPalette,
): DatasetColors | undefined {
  if (dataset.backgroundColor !== undefined || dataset.borderColor !== undefined) {
    return undefined
  }
  const colorAt = (position: number): string => palette.series[position] ?? palette.other
  const type = dataset.type ?? chartType
  if (type === "pie" || type === "doughnut") {
    const colors = (dataset.data ?? []).map((_, position) => colorAt(position))
    return { backgroundColor: colors, borderColor: colors }
  }
  return { backgroundColor: colorAt(index), borderColor: colorAt(index) }
}

/** 強調する位置が、データ点（bar・pie）か系列（share は部分ごとに1系列）のどちらの添字か。 */
export type EmphasisAxis = "point" | "series"

/**
 * 強調する項目だけ先頭の系列色、ほかは `muted` にする。色を持つ系列は `undefined`。
 * 強調が無いときは {@link colorsForDataset} を使う。
 */
export function emphasisColorsForDataset(
  dataset: DatasetShape,
  index: number,
  palette: ChartPalette,
  emphasis: { readonly positions: readonly number[]; readonly axis: EmphasisAxis },
): DatasetColors | undefined {
  if (dataset.backgroundColor !== undefined || dataset.borderColor !== undefined) {
    return undefined
  }
  const colorAt = (position: number): string =>
    emphasis.positions.includes(position) ? (palette.series[0] ?? palette.other) : palette.muted
  const colors =
    emphasis.axis === "series"
      ? colorAt(index)
      : (dataset.data ?? []).map((_, position) => colorAt(position))
  return { backgroundColor: colors, borderColor: colors }
}

/**
 * 系列 `index`（share の部分）を、`tones` の同じ位置の状態の色にする。`none` と語の無い位置は `muted`。
 * 色を持つ系列は `undefined`。
 */
export function tonedColorsForDataset(
  dataset: DatasetShape,
  index: number,
  palette: ChartPalette,
  tones: readonly ReportChartTone[],
): DatasetColors | undefined {
  if (dataset.backgroundColor !== undefined || dataset.borderColor !== undefined) {
    return undefined
  }
  const tone = tones[index] ?? "none"
  const color = tone === "none" ? palette.muted : palette.states[tone]
  return { backgroundColor: color, borderColor: color }
}
