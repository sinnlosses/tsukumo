// 折れ線の線端に系列名の札を描く。基準線の名前とは縦に離して並べる。
// 字を描く・測る道具は directLabelPlugin と共有するので、循環の import にならないようここに置く。

import {
  barEndText,
  barValueText,
  LABEL_OFFSET,
  lineEndLabelLines,
  lineEndPadding,
  SERIES_SIDE_PADDING,
  spreadLabels,
} from "./chart-label-layout.ts"
import { chartMarksOf, drawReferences, referenceLabelsOf } from "./chart-reference-mark.ts"

export const LABEL_GAP = 14
const FONT_SIZE = 12

export function labelFont(): string {
  return `${String(FONT_SIZE)}px ${Chart.defaults.font.family}`
}

export function widestText(ctx: CanvasRenderingContext2D, texts: readonly string[]): number {
  return Math.max(0, ...texts.map((text) => ctx.measureText(text).width))
}

export function measuredWidth(ctx: CanvasRenderingContext2D, texts: readonly string[]): number {
  ctx.save()
  ctx.font = labelFont()
  const width = widestText(ctx, texts)
  ctx.restore()
  return width
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
): void {
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
}

// 基準線があるときは系列が1つでも系列名を書き、基準線の名前と合わせて縦に離す。
export function drawLineEnds(chart: ChartInstance, withValues: boolean): void {
  const references = referenceLabelsOf(chart)
  if (chart.data.datasets.length < 2 && !withValues && references.length === 0) {
    return
  }
  const { ctx } = chart
  const ends = visibleEnds(chart, withValues).map((end) => ({
    ...end,
    lines: lineEndLabelLines(end.label, (text) => ctx.measureText(text).width, SERIES_SIDE_PADDING),
  }))
  const ys = spreadLabels(
    [...ends.map(({ point }) => point.y), ...references.map(({ y }) => y)],
    LABEL_GAP,
    [...ends.map(({ lines }) => lines.length * LABEL_GAP), ...references.map(() => LABEL_GAP)],
  )
  ends.forEach(({ point, lines }, index) => {
    const top = (ys[index] ?? point.y) - ((lines.length - 1) * LABEL_GAP) / 2
    lines.forEach((line, row) => {
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(
        line,
        point.x + LABEL_OFFSET,
        top + row * LABEL_GAP,
        SERIES_SIDE_PADDING - LABEL_OFFSET,
      )
    })
  })
  drawReferences(chart, references, ys.slice(ends.length))
}

/** 線端の札を描く条件を満たすときの右の余白。折ったあとの行の幅を測って決める。描かないときは 0。 */
export function lineEndSeriesPadding(chart: ChartInstance, withValues: boolean): number {
  if (
    chart.data.datasets.length < 2 &&
    !withValues &&
    chartMarksOf(chart).references.length === 0
  ) {
    return 0
  }
  const widths = lineEndTexts(chart, withValues).flatMap((text) =>
    lineEndLabelLines(text, (line) => measuredWidth(chart.ctx, [line]), SERIES_SIDE_PADDING).map(
      (line) => measuredWidth(chart.ctx, [line]),
    ),
  )
  return lineEndPadding(widths, SERIES_SIDE_PADDING)
}

function lineEndTexts(chart: ChartInstance, withValues: boolean): string[] {
  return chart.data.datasets.flatMap((dataset, index) =>
    chart.isDatasetVisible(index) ? [lineEndLabel(dataset, withValues)] : [],
  )
}

function lineEndLabel(dataset: ChartInstance["data"]["datasets"][number], withValues: boolean) {
  return withValues ? lineEndText(dataset) : (dataset.label ?? "")
}

function visibleEnds(chart: ChartInstance, withValues: boolean) {
  return chart.data.datasets.flatMap((dataset, index) => {
    const point = chart.getDatasetMeta(index).data.at(-1)
    return point === undefined || !chart.isDatasetVisible(index)
      ? []
      : [{ point, label: lineEndLabel(dataset, withValues) }]
  })
}

function lineEndText(dataset: ChartInstance["data"]["datasets"][number]): string {
  const value = dataset.data.at(-1)
  return dataset.label === undefined ? barValueText(value) : barEndText(dataset.label, value)
}
