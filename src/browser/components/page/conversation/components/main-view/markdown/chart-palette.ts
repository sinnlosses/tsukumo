// グラフの系列・データ点に配る色を決める。色の並びは呼び出し側が読んで渡す。

export type ChartPalette = {
  readonly series: readonly string[]
  readonly other: string
}

export type DatasetColors = {
  readonly backgroundColor: string | readonly string[]
  readonly borderColor: string | readonly string[]
}

export type DatasetShape = {
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
  chartType: string | undefined,
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
