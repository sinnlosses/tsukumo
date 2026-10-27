// 散布図の入力から、軸の範囲と各点の位置を決める。横は 0〜1 の割合、縦は画素。外れ値の名前は縦にずらして重ねない。

import type { ScatterSpec } from "../../../../../../../shared/report/plot-scatter.ts"
import {
  anchorOf,
  axisOf,
  positionOf,
  truncated,
  valueText,
  type GaugeAnchor,
} from "./gauge-layout.ts"

/** 名前を出す外れ値の上限。超えた分は「ほか N 点」にまとめる。 */
const OUTLIER_NAMES_MAX = 3

const PLOT_TOP = 76
const PLOT_HEIGHT = 140
const POINT_PAD = 6
const NAME_LINE = 14
const AXIS_TEXT_GAP = 18

type ScatterDot = {
  readonly key: string
  readonly at: number
  readonly y: number
}

type ScatterOutlier = ScatterDot & {
  readonly text: string
  readonly anchor: GaugeAnchor
  /** 名前を置く縦位置。 */
  readonly textY: number
}

type ScatterLayout = {
  readonly title: string
  readonly height: number
  readonly plotTop: number
  readonly plotBottom: number
  readonly minAt: number
  readonly maxAt: number
  readonly yText: string
  readonly axisTextY: number
  readonly minText: string
  readonly maxText: string
  readonly dots: readonly ScatterDot[]
  readonly outliers: readonly ScatterOutlier[]
  /** 名前を出さなかった外れ値の数（点は濃く描く）。 */
  readonly omitted: number
}

export function scatterLayoutOf(spec: ScatterSpec): ScatterLayout {
  const xAxis = axisOf(
    spec.points.map((point) => point.x),
    false,
  )
  const yAxis = axisOf(
    spec.points.map((point) => point.y),
    false,
  )
  const dots = spec.points.map((point, index) => ({
    key: `dot-${String(index)}`,
    at: positionOf(xAxis, point.x),
    y: yOf(yAxis.min, yAxis.max, point.y),
    outlier: point.outlier,
    label: point.label,
  }))
  const outliers = dots.filter((dot) => dot.outlier).toSorted((a, b) => a.at - b.at)
  const plotBottom = PLOT_TOP + PLOT_HEIGHT
  return {
    title: spec.title,
    height: plotBottom + AXIS_TEXT_GAP + 6,
    plotTop: PLOT_TOP,
    plotBottom,
    minAt: positionOf(xAxis, xAxis.min),
    maxAt: positionOf(xAxis, xAxis.max),
    yText: `↑ ${spec.yName} ${valueText(yAxis.min)}〜${valueText(yAxis.max)}`,
    axisTextY: plotBottom + AXIS_TEXT_GAP,
    minText: valueText(xAxis.min),
    maxText: `${valueText(xAxis.max)} ${spec.xName}`,
    dots: dots.filter((dot) => !dot.outlier).map((dot) => ({ key: dot.key, at: dot.at, y: dot.y })),
    outliers: outliers.map((dot, level) => ({
      key: dot.key,
      at: dot.at,
      y: dot.y,
      text: level < OUTLIER_NAMES_MAX ? truncated(dot.label) : "",
      anchor: anchorOf(dot.at),
      textY: dot.y - 8 - NAME_LINE * level,
    })),
    omitted: Math.max(0, outliers.length - OUTLIER_NAMES_MAX),
  }
}

function yOf(min: number, max: number, value: number): number {
  const fraction = (value - min) / (max - min)
  return PLOT_TOP + POINT_PAD + (1 - fraction) * (PLOT_HEIGHT - 2 * POINT_PAD)
}
