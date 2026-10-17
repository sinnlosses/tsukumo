// グラフの凡例を出さない代わりに、系列名・項目名を線と棒の端に直接書く Chart.js の plugin。
// arrow と slope の種類と系列名は `options.plugins["tsukumo-direct-label"]` から読む。

export const DIRECT_LABEL_PLUGIN_ID = "tsukumo-direct-label"

const LABEL_GAP = 14
const LABEL_OFFSET = 8
const ARROW_HEAD = 7
const FONT_SIZE = 12
const PIE_SIDE_PADDING = 90
const PIE_VERTICAL_PADDING = 24
const SERIES_SIDE_PADDING = 90
const SLOPE_SIDE_PADDING = 130
const ARROW_PADDING = 40
const NAME_ROW_PADDING = 22

type ArrowOrSlope = {
  readonly mode: "arrow" | "slope"
  readonly names: readonly string[]
}

type Padding = ChartInstance["options"]["layout"]["padding"]

/**
 * 縦の位置 `ys` が `gap` より近いものを、上から順に押し下げて離す。返す並びは入力と同じ順。
 */
export function spreadLabels(ys: readonly number[], gap: number): number[] {
  const order = ys.map((_, index) => index).toSorted((a, b) => (ys[a] ?? 0) - (ys[b] ?? 0))
  const spread = [...ys]
  let previous = Number.NEGATIVE_INFINITY
  for (const index of order) {
    const placed = Math.max(ys[index] ?? 0, previous + gap)
    spread[index] = placed
    previous = placed
  }
  return spread
}

export const directLabelPlugin = {
  id: DIRECT_LABEL_PLUGIN_ID,
  beforeLayout: (chart: ChartInstance): void => {
    chart.options.layout.padding = paddingFor(chart)
  },
  afterDatasetsDraw: (chart: ChartInstance): void => {
    const { ctx } = chart
    ctx.save()
    ctx.fillStyle = Chart.defaults.color
    ctx.font = `${String(FONT_SIZE)}px ${Chart.defaults.font.family}`
    const option = arrowOrSlopeOf(chart.options.plugins[DIRECT_LABEL_PLUGIN_ID])
    if (option?.mode === "arrow") {
      drawArrows(chart, option.names)
    } else if (option?.mode === "slope") {
      drawSlope(chart)
    } else if (chart.config.type === "pie") {
      drawPie(chart)
    } else if (chart.config.type === "line") {
      drawLineEnds(chart)
    } else if (chart.config.type === "bar") {
      drawBarEnds(chart)
    }
    ctx.restore()
  },
}

function paddingFor(chart: ChartInstance): Padding {
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const option = arrowOrSlopeOf(chart.options.plugins[DIRECT_LABEL_PLUGIN_ID])
  if (option?.mode === "arrow") {
    return { ...none, left: ARROW_PADDING, right: ARROW_PADDING, top: NAME_ROW_PADDING }
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
    case "line":
      return seriesCount > 1 ? { ...none, right: SERIES_SIDE_PADDING } : none
    case "bar":
      if (seriesCount < 2) {
        return none
      }
      return chart.options.indexAxis === "y"
        ? { ...none, right: SERIES_SIDE_PADDING }
        : { ...none, top: NAME_ROW_PADDING }
    default:
      return none
  }
}

function arrowOrSlopeOf(value: unknown): ArrowOrSlope | undefined {
  if (typeof value !== "object" || value === null || !("mode" in value) || !("names" in value)) {
    return undefined
  }
  const { mode, names } = value
  if (
    (mode !== "arrow" && mode !== "slope") ||
    !Array.isArray(names) ||
    !names.every((name): name is string => typeof name === "string")
  ) {
    return undefined
  }
  return { mode, names }
}

function drawText(
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

function drawPie(chart: ChartInstance): void {
  chart.getDatasetMeta(0).data.forEach(({ x, y, startAngle, endAngle, outerRadius }, index) => {
    const middle = (startAngle + endAngle) / 2
    const reach = outerRadius + LABEL_OFFSET
    const cosine = Math.cos(middle)
    drawText(
      chart.ctx,
      chart.data.labels[index] ?? "",
      x + cosine * reach,
      y + Math.sin(middle) * reach,
      cosine >= 0 ? "left" : "right",
      "middle",
    )
  })
}

function drawLineEnds(chart: ChartInstance): void {
  if (chart.data.datasets.length < 2) {
    return
  }
  const ends = visibleEnds(chart)
  const ys = spreadLabels(
    ends.map(({ point }) => point.y),
    LABEL_GAP,
  )
  ends.forEach(({ point, label }, index) => {
    drawText(chart.ctx, label, point.x + LABEL_OFFSET, ys[index] ?? point.y, "left", "middle")
  })
}

function visibleEnds(chart: ChartInstance) {
  return chart.data.datasets.flatMap((dataset, index) => {
    const point = chart.getDatasetMeta(index).data.at(-1)
    return point === undefined || !chart.isDatasetVisible(index)
      ? []
      : [{ point, label: dataset.label }]
  })
}

function drawBarEnds(chart: ChartInstance): void {
  if (chart.data.datasets.length < 2) {
    return
  }
  const horizontal = chart.options.indexAxis === "y"
  chart.data.datasets.forEach((dataset, index) => {
    const bar = chart.getDatasetMeta(index).data[0]
    if (bar === undefined) {
      return
    }
    if (horizontal) {
      drawText(chart.ctx, dataset.label, bar.x + 6, bar.y, "left", "middle")
    } else {
      drawText(chart.ctx, dataset.label, bar.x, bar.y - 6, "center", "bottom")
    }
  })
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

function drawArrows(chart: ChartInstance, names: readonly string[]): void {
  const { ctx } = chart
  const scale = chart.scales["x"]
  const dataset = chart.data.datasets[0]
  if (scale === undefined || dataset === undefined) {
    return
  }
  const color =
    typeof dataset.backgroundColor === "string" ? dataset.backgroundColor : Chart.defaults.color
  chart.getDatasetMeta(0).data.forEach(({ y }, row) => {
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
      drawText(ctx, names[0] ?? "", from, y - ARROW_HEAD - 4, "center", "bottom")
      drawText(ctx, names[1] ?? "", to, y - ARROW_HEAD - 4, "center", "bottom")
    }
  })
}
