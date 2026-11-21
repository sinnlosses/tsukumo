// レポートの `chart` の塊から組む Chart.js の設定の形。組むのは `chartConfigOf`。

import type { ReportChartTone } from "../../../shared/report/report-block-diagram.ts"
import type { LeafComponent } from "../../../shared/report/report-block.ts"

export type ChartConfig =
  | ChartBody
  | (ChartBody & { readonly tsukumo: { readonly height: number } })

export type ChartBody = {
  readonly type: string
  readonly data: {
    readonly labels: readonly string[]
    readonly datasets: readonly (
      | { readonly label: string; readonly data: readonly number[] }
      | {
          readonly label: string
          readonly data: readonly (readonly [number, number])[]
          readonly barThickness: number
        }
      | {
          readonly label: string
          readonly data: readonly number[]
          readonly barThickness: number
        }
    )[]
  }
  readonly options:
    | {
        readonly indexAxis: "y"
        readonly scales: HorizontalScales
      }
    | {
        readonly indexAxis: "y"
        readonly scales: HorizontalScales
        readonly plugins: SeriesPlugins
      }
    | PluginOptions
    | VerticalIntegerScale
    | (VerticalIntegerScale & Exclude<PluginOptions, Record<string, never>>)
    | {
        readonly indexAxis: "y"
        readonly scales: { readonly y: { readonly display: false } }
        readonly plugins: DirectLabelPlugins
      }
    | {
        readonly scales: { readonly y: { readonly display: false } }
        readonly plugins: DirectLabelPlugins
      }
    | {
        readonly indexAxis: "y"
        readonly scales: {
          readonly x: {
            readonly stacked: true
            readonly display: false
            readonly min: 0
            readonly max: 100
          }
          readonly y: { readonly stacked: true; readonly display: false }
        }
        readonly plugins: DirectLabelPlugins
      }
}

/** 縦の棒・折れ線の設定のうち、軸に触らない plugin だけの形。 */
type PluginOptions =
  | Record<string, never>
  | { readonly plugins: SeriesPlugins }
  | { readonly plugins: MarksPlugins }
  | { readonly plugins: DirectLabelPlugins }
  | { readonly plugins: DirectLabelPlugins & MarksPlugins }

/** 横向きの棒の軸。項目の軸（`y`）は目盛りを間引かず、値の軸（`x`）は値が整数だけのときに目盛りを整数に限る。 */
type HorizontalScales = {
  readonly y: { readonly ticks: { readonly autoSkip: false } }
  readonly x?: IntegerAxis
}

/** 値が整数だけの縦の棒・折れ線の値の軸。 */
export type VerticalIntegerScale = { readonly scales: { readonly y: IntegerAxis } }

/** Chart.js の既定は整数だけの値にも 0.5 刻みの目盛りを足すので、目盛りを整数に限る。 */
type IntegerAxis = { readonly ticks: { readonly precision: 0 } }

export type SeriesPlugins = {
  readonly "tsukumo-series":
    | { readonly emphasis: readonly number[] }
    | { readonly tones: readonly ReportChartTone[] }
}

export type DirectLabelPlugins = {
  readonly "tsukumo-direct-label": {
    readonly mode: "arrow" | "slope" | "span" | "share" | "values"
    readonly names: readonly string[]
  }
}

/**
 * `series` は `datasets` の位置。ただし share は部分ごとの dataset の位置（`index` は 0）、
 * arrow は1本の浮き棒の前（0）か後（1）の端を指す。
 */
export type ChartMarks = {
  readonly references: readonly { readonly value: number; readonly label: string }[]
  readonly annotations: readonly {
    readonly series: number
    readonly index: number
    readonly text: string
  }[]
}

export type MarksPlugins = { readonly "tsukumo-chart-marks": ChartMarks }

/** 値の軸の目盛りを整数に限る設定。値が整数だけのグラフ（`hasOnlyIntegers`）に添える。 */
export const INTEGER_AXIS = { ticks: { precision: 0 } } as const satisfies IntegerAxis

export function hasOnlyIntegers(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
): boolean {
  return block.series.every(({ values }) => values.every(Number.isInteger))
}
