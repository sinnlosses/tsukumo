// ヒストグラムの入力から、階級の棒の位置（横は 0〜1 の割合、縦は画素）と、中央値と範囲の字を決める。

import type { HistogramSpec } from "../../../../../../../shared/report/plot-histogram.ts"
import { anchorOf, axisOf, positionOf, valueText, type GaugeAnchor } from "./gauge-layout.ts"

const PLOT_TOP = 30
const PLOT_HEIGHT = 110
const AXIS_TEXT_GAP = 18
const NOTE_GAP = 18

/** 隣り合う棒のあいだに空ける割合。 */
const BAR_GAP = 0.004

/** 階級が 1 つで幅が 0 のとき棒に与える幅の割合。 */
const SINGLE_BAR_WIDTH = 0.2

type HistogramBar = {
  readonly key: string
  readonly at: number
  readonly width: number
  readonly top: number
  readonly height: number
}

type HistogramLayout = {
  readonly title: string
  readonly height: number
  readonly plotBottom: number
  readonly minAt: number
  readonly maxAt: number
  readonly bars: readonly HistogramBar[]
  readonly medianAt: number
  readonly medianText: string
  readonly medianAnchor: GaugeAnchor
  readonly axisTextY: number
  readonly minText: string
  readonly maxText: string
  readonly noteY: number
  readonly noteText: string
}

export function histogramLayoutOf(spec: HistogramSpec): HistogramLayout {
  const axis = axisOf([spec.min, spec.max], false)
  const tallest = Math.max(...spec.bins.map((bin) => bin.count), 1)
  const plotBottom = PLOT_TOP + PLOT_HEIGHT
  const bars = spec.bins.map((bin, index) => {
    const from = positionOf(axis, bin.from)
    const to = positionOf(axis, bin.to)
    const single = spec.bins.length === 1 && to - from === 0
    const height = (bin.count / tallest) * PLOT_HEIGHT
    return {
      key: `bar-${String(index)}`,
      at: single ? positionOf(axis, (axis.min + axis.max) / 2) - SINGLE_BAR_WIDTH / 2 : from,
      width: single ? SINGLE_BAR_WIDTH : Math.max(0, to - from - BAR_GAP),
      top: plotBottom - height,
      height,
    }
  })
  const medianAt = positionOf(axis, spec.median)
  const axisTextY = plotBottom + AXIS_TEXT_GAP
  return {
    title: spec.title,
    height: axisTextY + NOTE_GAP + 6,
    plotBottom,
    minAt: positionOf(axis, axis.min),
    maxAt: positionOf(axis, axis.max),
    bars,
    medianAt,
    medianText: `中央値 ${valueText(spec.median)}`,
    medianAnchor: anchorOf(medianAt),
    axisTextY,
    minText: valueText(spec.min),
    maxText: `${valueText(spec.max)} ${spec.unit}`,
    noteY: axisTextY + NOTE_GAP,
    noteText: `範囲 ${valueText(spec.min)}〜${valueText(spec.max)} ・ 最多の階級 ${String(tallest)} 件`,
  }
}
