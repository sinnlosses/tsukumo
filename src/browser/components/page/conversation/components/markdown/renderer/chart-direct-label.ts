// グラフの凡例を出さない代わりに、系列名・項目名を線と棒の端に直接書く Chart.js の plugin。
// arrow・slope・span・share の種類と系列名は `options.plugins["tsukumo-direct-label"]` から読む。
// 折れ線の基準線と点の注記も、系列名の札と重ならないよう同じ plugin で描く。

import { SHARE_BAR_THICKNESS } from "../../../domain/report-diagram-markdown.ts"
import {
  ARROW_HEAD,
  arrowPadding,
  BAR_END_GAP,
  barEndPadding,
  barEndText,
  barValueText,
  LABEL_OFFSET,
  NAME_COLUMN_GAP,
  NAME_ROW_PADDING,
  type Padding,
  SHARE_MARK_SIZE,
  SHARE_MARK_WIDTH,
  type ShareLabelPlace,
  shareLabelRows,
  spreadLabels,
} from "./chart-label-layout.ts"
import {
  drawLineEnds,
  drawText,
  labelFont,
  LABEL_GAP,
  lineEndSeriesPadding,
  measuredWidth,
  widestText,
} from "./chart-line-end.ts"
import { chartMarksOf, drawAnnotations, widenToReferences } from "./chart-reference-mark.ts"
import { resolveColor } from "./theme-color.ts"

const DIRECT_LABEL_PLUGIN_ID = "tsukumo-direct-label"

const BAR_VALUE_WEIGHT = 600
const PIE_SIDE_PADDING = 90
const PIE_VERTICAL_PADDING = 24
const SLOPE_SIDE_PADDING = 130
const NAME_COLUMN_SHARE = 0.4
const SHARE_ROW_HEIGHT = 18
const SHARE_ROW_GAP = 8
const SHARE_BAR_MARGIN = 12

type DirectLabelOption = {
  readonly mode: "arrow" | "slope" | "span" | "share" | "values"
  readonly names: readonly string[]
}

export const directLabelPlugin = {
  id: DIRECT_LABEL_PLUGIN_ID,
  beforeLayout: (chart: ChartInstance): void => {
    const padding = paddingFor(chart)
    chart.options.layout.padding = padding
    if (directLabelOptionOf(chart.options.plugins[DIRECT_LABEL_PLUGIN_ID])?.mode === "share") {
      fitShareHeight(chart, padding.bottom)
    }
  },
  afterDataLimits: (
    chart: ChartInstance,
    { scale }: { readonly scale: { readonly id: string; min: number; max: number } },
  ): void => {
    widenToReferences(chart, scale)
  },
  afterDatasetsDraw: (chart: ChartInstance): void => {
    const { ctx } = chart
    ctx.save()
    ctx.fillStyle = Chart.defaults.color
    ctx.font = labelFont()
    const option = directLabelOptionOf(chart.options.plugins[DIRECT_LABEL_PLUGIN_ID])
    if (option?.mode === "arrow") {
      drawArrows(chart, option.names)
    } else if (option?.mode === "span") {
      drawSpans(chart)
    } else if (option?.mode === "share") {
      drawShare(chart)
    } else if (option?.mode === "slope") {
      drawSlope(chart)
    } else if (chart.config.type === "pie") {
      drawPie(chart, option?.mode === "values")
    } else if (chart.config.type === "line") {
      drawLineEnds(chart, option?.mode === "values")
      drawAnnotations(chart)
    } else if (chart.config.type === "bar") {
      drawBarEnds(chart)
    }
    ctx.restore()
  },
}

function fitShareHeight(chart: ChartInstance, labelPadding: number): void {
  const container = chart.canvas.parentElement
  if (container !== null) {
    container.style.height = `${String(SHARE_BAR_MARGIN * 2 + SHARE_BAR_THICKNESS + labelPadding)}px`
  }
}

function paddingFor(chart: ChartInstance): Padding {
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const option = directLabelOptionOf(chart.options.plugins[DIRECT_LABEL_PLUGIN_ID])
  if (option?.mode === "arrow") {
    const { left, right } = arrowExtent(chart, ARROW_HEAD)
    return { ...none, left, right, top: NAME_ROW_PADDING }
  }
  if (option?.mode === "span") {
    const { left, right } = arrowExtent(chart, 0)
    return { ...none, left, right }
  }
  if (option?.mode === "share") {
    const rows = shareRows(chart).reduce((most, { row }) => Math.max(most, row + 1), 0)
    return { ...none, bottom: rows === 0 ? 0 : SHARE_ROW_GAP + rows * SHARE_ROW_HEIGHT }
  }
  if (option?.mode === "slope") {
    return { ...none, left: SLOPE_SIDE_PADDING, right: SLOPE_SIDE_PADDING }
  }
  const seriesCount = chart.data.datasets.length
  switch (chart.config.type) {
    case "pie":
      return {
        ...none,
        left: PIE_SIDE_PADDING,
        right: PIE_SIDE_PADDING,
        top: PIE_VERTICAL_PADDING,
        bottom: PIE_VERTICAL_PADDING,
      }
    case "line": {
      const references = chartMarksOf(chart).references
      const referenceWidth =
        references.length === 0
          ? 0
          : LABEL_OFFSET +
            measuredWidth(
              chart.ctx,
              references.map(({ label }) => label),
            )
      return {
        ...none,
        right: Math.max(lineEndSeriesPadding(chart, option?.mode === "values"), referenceWidth),
      }
    }
    case "bar":
      return barEndPadding(chart.options.indexAxis === "y", seriesCount, barEndTextWidth(chart))
    default:
      return none
  }
}

function barValueFont(): string {
  return `${String(BAR_VALUE_WEIGHT)} ${labelFont()}`
}

// 項目名と前後の数字の字の幅から、左右の余白を決める。`beforeLayout` でも呼ぶので、描く領域（`chartArea`）はまだ無く、読まない。
function arrowExtent(chart: ChartInstance, head: number) {
  const { ctx } = chart
  const values = (chart.data.datasets[0]?.data ?? []).flatMap((pair) =>
    Array.isArray(pair) ? pair.filter((value) => typeof value === "number").map(String) : [],
  )
  const names = measuredWidth(ctx, chart.data.labels)
  const valueWidth = measuredWidth(ctx, values)
  const nameWidth = Math.min(names, chart.width * NAME_COLUMN_SHARE)
  return { ...arrowPadding(nameWidth, valueWidth, head), nameWidth }
}

// share は左右の余白が0で x 軸が 0〜100 なので、部分の幅は `chart.width` と割合だけから決まる。`beforeLayout` と描く時で同じ置き場になる。
function shareRows(
  chart: ChartInstance,
): (ShareLabelPlace & { readonly text: string; readonly color: unknown })[] {
  const { ctx } = chart
  ctx.save()
  ctx.font = labelFont()
  const parts = chart.data.datasets.map((dataset) => {
    const percent = typeof dataset.data[0] === "number" ? dataset.data[0] : 0
    const text = `${dataset.label} ${String(Math.round(percent))}%`
    return { text, width: (chart.width * percent) / 100, textWidth: ctx.measureText(text).width }
  })
  ctx.restore()
  const places = shareLabelRows(parts, chart.width)
  return places.map((place, index) => ({
    ...place,
    text: parts[index]?.text ?? "",
    color: chart.data.datasets[index]?.backgroundColor,
  }))
}

function directLabelOptionOf(value: unknown): DirectLabelOption | undefined {
  if (typeof value !== "object" || value === null || !("mode" in value) || !("names" in value)) {
    return undefined
  }
  const { mode, names } = value
  if (
    (mode !== "arrow" &&
      mode !== "slope" &&
      mode !== "span" &&
      mode !== "share" &&
      mode !== "values") ||
    !Array.isArray(names) ||
    !names.every((name): name is string => typeof name === "string")
  ) {
    return undefined
  }
  return { mode, names }
}

// 幅が `maxWidth` を超えるときは、字を詰めて収める。
function drawNameInColumn(
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  maxWidth: number,
): void {
  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  ctx.fillText(text, right, y, maxWidth)
}

function drawPie(chart: ChartInstance, withValues: boolean): void {
  chart.getDatasetMeta(0).data.forEach(({ x, y, startAngle, endAngle, outerRadius }, index) => {
    const middle = (startAngle + endAngle) / 2
    const reach = outerRadius + LABEL_OFFSET
    const cosine = Math.cos(middle)
    const name = chart.data.labels[index] ?? ""
    drawText(
      chart.ctx,
      withValues ? barEndText(name, chart.data.datasets[0]?.data[index]) : name,
      x + cosine * reach,
      y + Math.sin(middle) * reach,
      cosine >= 0 ? "left" : "right",
      "middle",
    )
  })
}

function drawBarEnds(chart: ChartInstance): void {
  const horizontal = chart.options.indexAxis === "y"
  const emphasisColor = resolveColor(chart.canvas, "--ink-bright")
  const quietColor = Chart.defaults.color
  chart.ctx.font = barValueFont()
  chart.data.datasets.forEach((dataset, index) => {
    chart.getDatasetMeta(index).data.forEach((bar, point) => {
      const text = barTextAt(chart, index, point, dataset.data[point])
      chart.ctx.fillStyle = emphasizedAt(chart, point) ? emphasisColor : quietColor
      if (horizontal) {
        drawText(chart.ctx, text, bar.x + BAR_END_GAP, bar.y, "left", "middle")
      } else {
        drawText(chart.ctx, text, bar.x, bar.y - BAR_END_GAP, "center", "bottom")
      }
    })
  })
}

function emphasizedAt(chart: ChartInstance, point: number): boolean {
  const option = chart.options.plugins["tsukumo-series"]
  return (
    typeof option === "object" &&
    option !== null &&
    "emphasis" in option &&
    Array.isArray(option.emphasis) &&
    option.emphasis.includes(point)
  )
}

function barTextAt(chart: ChartInstance, series: number, point: number, value: unknown): string {
  const seriesName =
    chart.data.datasets.length >= 2 && point === 0 ? chart.data.datasets[series]?.label : undefined
  return seriesName === undefined ? barValueText(value) : barEndText(seriesName, value)
}

// 余白は `beforeLayout` で決めるので、描く前の字の幅を測る。
function barEndTextWidth(chart: ChartInstance): number {
  const texts = chart.data.datasets.flatMap((dataset, series) =>
    dataset.data.map((value, point) => barTextAt(chart, series, point, value)),
  )
  chart.ctx.save()
  chart.ctx.font = barValueFont()
  const width = widestText(chart.ctx, texts)
  chart.ctx.restore()
  return width
}

function drawSlope(chart: ChartInstance): void {
  const rows = chart.data.datasets.flatMap((dataset, index) => {
    const [start, end] = chart.getDatasetMeta(index).data
    const [before, after] = dataset.data
    return start === undefined || end === undefined
      ? []
      : [{ name: dataset.label, start, end, before: String(before), after: String(after) }]
  })
  const startYs = spreadLabels(
    rows.map(({ start }) => start.y),
    LABEL_GAP,
  )
  const endYs = spreadLabels(
    rows.map(({ end }) => end.y),
    LABEL_GAP,
  )
  rows.forEach(({ name, start, end, before, after }, index) => {
    drawText(
      chart.ctx,
      `${name}  ${before}`,
      start.x - LABEL_OFFSET,
      startYs[index] ?? start.y,
      "right",
      "middle",
    )
    drawText(
      chart.ctx,
      `${after}  ${name}`,
      end.x + LABEL_OFFSET,
      endYs[index] ?? end.y,
      "left",
      "middle",
    )
  })
}

function drawSpans(chart: ChartInstance): void {
  const scale = chart.scales["x"]
  const dataset = chart.data.datasets[0]
  if (scale === undefined || dataset === undefined) {
    return
  }
  const { overhang, nameWidth } = arrowExtent(chart, 0)
  const nameRight = chart.chartArea.left - overhang - NAME_COLUMN_GAP
  chart.getDatasetMeta(0).data.forEach(({ y }, row) => {
    drawNameInColumn(chart.ctx, chart.data.labels[row] ?? "", nameRight, y, nameWidth)
    const pair = dataset.data[row]
    if (!Array.isArray(pair)) {
      return
    }
    const [start, end] = pair
    if (typeof start !== "number" || typeof end !== "number") {
      return
    }
    const low = Math.min(start, end)
    const high = Math.max(start, end)
    drawText(
      chart.ctx,
      String(low),
      scale.getPixelForValue(low) - LABEL_OFFSET,
      y,
      "right",
      "middle",
    )
    drawText(
      chart.ctx,
      String(high),
      scale.getPixelForValue(high) + LABEL_OFFSET,
      y,
      "left",
      "middle",
    )
  })
}

function drawShare(chart: ChartInstance): void {
  const bar = chart.getDatasetMeta(0).data[0]
  if (bar === undefined) {
    return
  }
  const barBottom = bar.y + bar.height / 2
  const left = chart.chartArea.left
  const onFill = resolveColor(chart.canvas, "--ground")
  shareRows(chart).forEach(({ row, left: unitLeft, text, color }) => {
    if (row < 0) {
      chart.ctx.fillStyle = onFill
      drawText(chart.ctx, text, left + unitLeft, bar.y, "left", "middle")
      return
    }
    const y = barBottom + SHARE_ROW_GAP + row * SHARE_ROW_HEIGHT + SHARE_ROW_HEIGHT / 2
    chart.ctx.fillStyle = typeof color === "string" ? color : Chart.defaults.color
    chart.ctx.fillRect(left + unitLeft, y - SHARE_MARK_SIZE / 2, SHARE_MARK_SIZE, SHARE_MARK_SIZE)
    chart.ctx.fillStyle = Chart.defaults.color
    drawText(chart.ctx, text, left + unitLeft + SHARE_MARK_WIDTH, y, "left", "middle")
  })
}

function drawArrows(chart: ChartInstance, names: readonly string[]): void {
  const { ctx } = chart
  const scale = chart.scales["x"]
  const dataset = chart.data.datasets[0]
  if (scale === undefined || dataset === undefined) {
    return
  }
  const color =
    typeof dataset.backgroundColor === "string" ? dataset.backgroundColor : Chart.defaults.color
  const { overhang, nameWidth } = arrowExtent(chart, ARROW_HEAD)
  const nameRight = chart.chartArea.left - overhang - NAME_COLUMN_GAP
  chart.getDatasetMeta(0).data.forEach(({ y }, row) => {
    drawNameInColumn(ctx, chart.data.labels[row] ?? "", nameRight, y, nameWidth)
    const pair = dataset.data[row]
    if (!Array.isArray(pair)) {
      return
    }
    const [before, after] = pair
    if (typeof before !== "number" || typeof after !== "number") {
      return
    }
    const from = scale.getPixelForValue(before)
    const to = scale.getPixelForValue(after)
    const direction = to >= from ? 1 : -1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(to + direction * ARROW_HEAD, y)
    ctx.lineTo(to - direction * 1, y - ARROW_HEAD)
    ctx.lineTo(to - direction * 1, y + ARROW_HEAD)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = Chart.defaults.color
    drawText(
      ctx,
      String(before),
      from - direction * LABEL_OFFSET,
      y,
      direction > 0 ? "right" : "left",
      "middle",
    )
    drawText(
      ctx,
      String(after),
      to + direction * (ARROW_HEAD + LABEL_OFFSET),
      y,
      direction > 0 ? "left" : "right",
      "middle",
    )
    if (row === 0) {
      drawSeriesNames(ctx, names, from, to, y - ARROW_HEAD - 4)
    }
  })
}

// 前後の系列名は1行目の矢印の両端の上に書く。端が近くて中央揃えだと重なるときは、外へ向けて離す。
function drawSeriesNames(
  ctx: CanvasRenderingContext2D,
  names: readonly string[],
  from: number,
  to: number,
  y: number,
): void {
  const first = names[0] ?? ""
  const second = names[1] ?? ""
  const needed = (ctx.measureText(first).width + ctx.measureText(second).width) / 2 + LABEL_OFFSET
  if (Math.abs(to - from) >= needed) {
    drawText(ctx, first, from, y, "center", "bottom")
    drawText(ctx, second, to, y, "center", "bottom")
    return
  }
  const firstIsLeft = from <= to
  drawText(ctx, first, from, y, firstIsLeft ? "right" : "left", "bottom")
  drawText(ctx, second, to, y, firstIsLeft ? "left" : "right", "bottom")
}
