// 図の部品（`chart`・`chartGrid`・`svg`・`mermaid`）の本体の値を組む。Chart.js の設定・SVG の図形の並び・時系列の図の通し番号を持つ（`graph` は `graphSource`）。

import { sumBy } from "remeda"

import type { ReportChartTone } from "../../../shared/report/report-block-diagram.ts"
import type { LeafComponent } from "../../../shared/report/report-block.ts"

type ChartConfig = ChartBody | (ChartBody & { readonly tsukumo: { readonly height: number } })

type ChartBody = {
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
        readonly scales: { readonly y: { readonly ticks: { readonly autoSkip: false } } }
      }
    | {
        readonly indexAxis: "y"
        readonly scales: { readonly y: { readonly ticks: { readonly autoSkip: false } } }
        readonly plugins: SeriesPlugins
      }
    | Record<string, never>
    | { readonly plugins: SeriesPlugins }
    | { readonly plugins: MarksPlugins }
    | { readonly plugins: DirectLabelPlugins }
    | { readonly plugins: DirectLabelPlugins & MarksPlugins }
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

type SeriesPlugins = {
  readonly "tsukumo-series":
    | { readonly emphasis: readonly number[] }
    | { readonly tones: readonly ReportChartTone[] }
}

type DirectLabelPlugins = {
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

type MarksPlugins = { readonly "tsukumo-chart-marks": ChartMarks }

const ARROW_BAR_THICKNESS = 4
const SPAN_BAR_THICKNESS = 12
export const SHARE_BAR_THICKNESS = 36
const CHART_MIN_HEIGHT = 320
const CHART_ROW_HEIGHT = 28
const CHART_FRAME_HEIGHT = 48

/**
 * `chart` の塊から Chart.js の設定を組む。色は書かない。`pie` は `series` の先頭だけを描く。
 * `arrow` は前→後を浮き棒1本ずつ、`slope` は項目ごとに前→後の線1本にして、描く側の plugin に系列名を渡す。
 * `span` は項目ごとの始まり〜終わりを矢じりの無い太い浮き棒にする。`share` は先頭の系列を百分率にして、部分ごとに1系列の積み上げ横棒1本にする。
 * どれも項目名・部分の名前は plugin が書くので、縦の軸（`y`）は出さない。
 * `annotation.values` は `plot` 由来の印で、line は線端に系列名と終点の値、pie は項目名と値を plugin に書かせる。
 * line の基準線（`references`）と点の注記（`annotations`）も plugin に描かせる。
 */
export function chartConfigOf(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
  annotation: { readonly values: boolean } = { values: false },
): ChartConfig {
  if (block.chartKind === "share") {
    const percents = percentagesOf(block.series[0]?.values ?? [])
    return {
      type: "bar",
      data: {
        labels: [""],
        datasets: block.labels.map((label, index) => ({
          label,
          data: [percents[index] ?? 0],
          barThickness: SHARE_BAR_THICKNESS,
        })),
      },
      options: {
        indexAxis: "y",
        scales: {
          x: { stacked: true, display: false, min: 0, max: 100 },
          y: { stacked: true, display: false },
        },
        plugins: {
          "tsukumo-direct-label": { mode: "share", names: [] },
          ...seriesPluginsOf(block).plugins,
          ...marksPluginsOf(block).plugins,
        },
      },
    }
  }
  if (block.chartKind === "arrow" || block.chartKind === "slope" || block.chartKind === "span") {
    const [before, after] = block.series
    const names = [before?.name ?? "", after?.name ?? ""]
    const pairAt = (index: number): readonly [number, number] => [
      before?.values[index] ?? 0,
      after?.values[index] ?? 0,
    ]
    const plugins = {
      "tsukumo-direct-label": { mode: block.chartKind, names },
      ...(block.chartKind === "arrow" ? marksPluginsOf(block).plugins : {}),
    }
    return block.chartKind === "arrow" || block.chartKind === "span"
      ? {
          type: "bar",
          data: {
            labels: [...block.labels],
            datasets: [
              {
                label: names.join(" → "),
                data: block.labels.map((_, index) => pairAt(index)),
                barThickness:
                  block.chartKind === "arrow" ? ARROW_BAR_THICKNESS : SPAN_BAR_THICKNESS,
              },
            ],
          },
          options: { indexAxis: "y", scales: { y: { display: false } }, plugins },
        }
      : {
          type: "line",
          data: {
            labels: names,
            datasets: block.labels.map((label, index) => ({
              label,
              data: [...pairAt(index)],
            })),
          },
          options: { scales: { y: { display: false } }, plugins },
        }
  }
  const series = block.chartKind === "pie" ? block.series.slice(0, 1) : block.series
  const data = {
    labels: [...block.labels],
    datasets: series.map(({ name, values }) => ({ label: name, data: [...values] })),
  }
  if (block.chartKind === "bar" && block.horizontal) {
    return {
      type: block.chartKind,
      data,
      options: {
        indexAxis: "y",
        scales: { y: { ticks: { autoSkip: false } } },
        ...seriesAndMarksOf(block),
      },
      tsukumo: {
        height: Math.max(
          CHART_MIN_HEIGHT,
          block.labels.length * CHART_ROW_HEIGHT + CHART_FRAME_HEIGHT,
        ),
      },
    }
  }
  if (block.chartKind === "line") {
    const marks = marksPluginsOf(block)
    if (!annotation.values) {
      return { type: block.chartKind, data, options: marks }
    }
    const direct = {
      "tsukumo-direct-label": { mode: "values", names: [] },
    } satisfies DirectLabelPlugins
    return {
      type: block.chartKind,
      data,
      options: { plugins: "plugins" in marks ? { ...direct, ...marks.plugins } : direct },
    }
  }
  if (annotation.values && block.chartKind === "pie") {
    return {
      type: block.chartKind,
      data,
      options: {
        plugins: {
          "tsukumo-direct-label": { mode: "values", names: [] },
          ...seriesPluginsOf(block).plugins,
        },
      },
    }
  }
  return {
    type: block.chartKind,
    data,
    options: { ...seriesAndMarksOf(block) },
  }
}

type ChartGridBlock = Extract<LeafComponent, { readonly kind: "chartGrid" }>

type ChartValueRange = { readonly min: number; readonly max: number }

/** 格子の図1つの設定。値の軸（`y`）の範囲は格子で共通。 */
type ChartGridPanelConfig = {
  readonly heading: string
  readonly config: Omit<ChartBody, "options"> & {
    readonly options: { readonly scales: { readonly y: ChartValueRange } }
  }
}

const CHART_GRID_TICK_COUNT = 5
const CHART_LINE_PADDING_RATE = 0.08

/** `chartGrid` の塊から、図ごとの Chart.js の設定を組む。値の軸の範囲は {@link sharedValueRange} で揃える。 */
export function chartGridConfigsOf(block: ChartGridBlock): readonly ChartGridPanelConfig[] {
  const range = sharedValueRange(block.chartKind, block.panels)
  return block.panels.map((panel) => {
    const { type, data } = chartConfigOf({
      kind: "chart",
      title: panel.heading,
      chartKind: block.chartKind,
      labels: block.labels,
      series: panel.series,
      horizontal: false,
      emphasis: [],
      fold: "",
      aside: "",
    })
    return { heading: panel.heading, config: { type, data, options: { scales: { y: range } } } }
  })
}

type SvgFigure = {
  readonly width: number
  readonly height: number
  readonly shapes: readonly SvgShape[]
  readonly legend: Extract<LeafComponent, { readonly kind: "svg" }>["legend"]
}

type SvgShape = Extract<LeafComponent, { readonly kind: "svg" }>["shapes"][number]

const SVG_ARROW_MARKER_ID = "report-svg-arrow"

const SVG_LABEL_FONT_SIZE = 14

const SVG_LABEL_INSET = 12

const SVG_LABEL_TOP_GAP = 8

const SVG_SUB_FONT_SIZE = 12

/** `top-left` の題の下に説明を置くときの、題の基線から説明の基線までの距離。 */
const SVG_SUB_LINE_GAP = 16

/** `center` で説明があるとき、題を枠の中心から上げる量。 */
const SVG_SUB_LABEL_SHIFT = 8

/** `center` で説明があるとき、説明を枠の中心から下げる量。 */
const SVG_SUB_DROP = 10

export type SvgTone = Exclude<Extract<SvgShape, { readonly kind: "rect" }>["tone"], "none">

/** 描く図形1つ。`tone` が無いときは色の目印を付けない。字の `sub` は説明の字（弱い色）。 */
export type SvgPrimitive =
  | {
      readonly kind: "rect"
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly emphasis: boolean
      readonly tone?: SvgTone
    }
  | {
      readonly kind: "line"
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly arrow: boolean
      readonly dashed: boolean
      readonly tone?: SvgTone
    }
  | {
      readonly kind: "text"
      readonly x: number
      readonly y: number
      readonly text: string
      readonly fontSize: number
      readonly centered: boolean
      readonly sub: boolean
    }

export type SvgDrawing = {
  readonly width: number
  readonly height: number
  /** 矢じりの定義の id。線の矢印はこの id を `url(#…)` で指す。 */
  readonly arrowMarkerId: string
  readonly primitives: readonly SvgPrimitive[]
  readonly legend: SvgFigure["legend"]
}

/** `svg` の塊の図形を、描く順の図形の並びにする。色は持たず、`tone` の目印だけを運ぶ。 */
export function svgDrawingOf({ width, height, shapes, legend }: SvgFigure): SvgDrawing {
  return {
    width,
    height,
    arrowMarkerId: SVG_ARROW_MARKER_ID,
    primitives: shapes.flatMap(svgShapePrimitives),
    legend,
  }
}

/** 本文から「3 の呼び出し」と指せるよう、時系列の図の矢印に通し番号を振る。書き手が `autonumber` を書いていれば足さない。 */
export function withSequenceAutonumber(source: string): string {
  const [head = "", ...rest] = source.split("\n")
  if (head.trim() !== "sequenceDiagram" || rest.some((line) => /^\s*autonumber\b/.test(line))) {
    return source
  }
  return ["sequenceDiagram", "  autonumber", ...rest].join("\n")
}

/** 各値を（負を0に丸めた）合計に対する百分率にする。合計が0なら全部0。 */
function percentagesOf(values: readonly number[]): number[] {
  const total = sumBy(values, (value) => Math.max(0, value))
  return values.map((value) => (total > 0 ? (Math.max(0, value) / total) * 100 : 0))
}

function toneOf(tone: Extract<SvgShape, { readonly kind: "rect" }>["tone"]): SvgTone | undefined {
  return tone === "none" ? undefined : tone
}

function svgShapePrimitives(shape: SvgShape): readonly SvgPrimitive[] {
  switch (shape.kind) {
    case "rect": {
      const rect: SvgPrimitive = {
        kind: "rect",
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        emphasis: shape.emphasis,
        tone: toneOf(shape.tone),
      }
      if (shape.label.trim() === "") return [rect]
      const hasSub = shape.sub.trim() !== ""
      if (shape.labelAt === "top-left") {
        const labelY = shape.y + SVG_LABEL_FONT_SIZE + SVG_LABEL_TOP_GAP
        return [
          rect,
          svgText(shape.x + SVG_LABEL_INSET, labelY, shape.label, { centered: false, sub: false }),
          ...(hasSub
            ? [
                svgText(shape.x + SVG_LABEL_INSET, labelY + SVG_SUB_LINE_GAP, shape.sub, {
                  centered: false,
                  sub: true,
                }),
              ]
            : []),
        ]
      }
      const centerX = shape.x + shape.width / 2
      const centerY = shape.y + shape.height / 2
      if (!hasSub) {
        return [rect, svgText(centerX, centerY, shape.label, { centered: true, sub: false })]
      }
      return [
        rect,
        svgText(centerX, centerY - SVG_SUB_LABEL_SHIFT, shape.label, {
          centered: true,
          sub: false,
        }),
        svgText(centerX, centerY + SVG_SUB_DROP, shape.sub, { centered: true, sub: true }),
      ]
    }
    case "line": {
      const line: SvgPrimitive = {
        kind: "line",
        x1: shape.x1,
        y1: shape.y1,
        x2: shape.x2,
        y2: shape.y2,
        arrow: shape.arrow,
        dashed: shape.dashed,
        tone: toneOf(shape.tone),
      }
      return shape.label.trim() === ""
        ? [line]
        : [
            line,
            svgText((shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2 - 6, shape.label, {
              centered: true,
              sub: false,
            }),
          ]
    }
    case "text":
      return [svgText(shape.x, shape.y, shape.text, { centered: false, sub: false })]
  }
}

/** `sub` は `rect` の説明の字。`report-notation-figure.css` が `data-sub` を目印に弱い色を当てる。 */
function svgText(
  x: number,
  y: number,
  text: string,
  { centered, sub }: { readonly centered: boolean; readonly sub: boolean },
): SvgPrimitive {
  return {
    kind: "text",
    x,
    y,
    text,
    fontSize: sub ? SVG_SUB_FONT_SIZE : SVG_LABEL_FONT_SIZE,
    centered,
    sub,
  }
}

/** 基準線と点の注記を、描く側の plugin に渡す。注記の系列は `series` の位置に直し、名指しの外れた注記は描かない。 */
function marksPluginsOf(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
): { readonly plugins: MarksPlugins } | Record<string, never> {
  const references = block.references ?? []
  const annotations = (block.annotations ?? []).flatMap(({ label, index, text }) => {
    const series = block.series.findIndex(({ name }) => name === label)
    if (series < 0 || index >= block.labels.length) {
      return []
    }
    switch (block.chartKind) {
      case "share":
        return series === 0 ? [{ series: index, index: 0, text }] : []
      default:
        return [{ series, index, text }]
    }
  })
  return references.length === 0 && annotations.length === 0
    ? {}
    : { plugins: { "tsukumo-chart-marks": { references: [...references], annotations } } }
}

/**
 * `emphasis` の項目を、`labels` の何番目かの並びにして描く側の plugin に渡す。
 * 効くのは bar・pie・share だけで、`emphasis` が空ならなにも足さない。
 * share に `tones` があれば、`emphasis` の代わりに部分ごとの色の語を渡す。
 */
function seriesPluginsOf(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
): { readonly plugins: SeriesPlugins } | Record<string, never> {
  if (block.chartKind === "share" && block.tones !== undefined) {
    return { plugins: { "tsukumo-series": { tones: [...block.tones] } } }
  }
  const emphasized = ["bar", "pie", "share"].includes(block.chartKind) && block.emphasis.length > 0
  return emphasized
    ? {
        plugins: {
          "tsukumo-series": {
            emphasis: block.labels.flatMap((label, index) =>
              block.emphasis.includes(label) ? [index] : [],
            ),
          },
        },
      }
    : {}
}

function seriesAndMarksOf(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
): { readonly plugins: SeriesPlugins & Partial<MarksPlugins> } | Record<string, never> {
  const plugins = { ...seriesPluginsOf(block).plugins, ...marksPluginsOf(block).plugins }
  return Object.keys(plugins).length === 0 ? {} : { plugins }
}

/**
 * 格子の全部の図の値から、値の軸の範囲を1つに決める。
 * `bar` は 0 を含め、`line` は最小〜最大に幅の 8% の余白を足す。どちらも目盛りの刻みの倍数へ外側に丸め、幅を 0 にしない。
 */
function sharedValueRange(
  chartKind: ChartGridBlock["chartKind"],
  panels: ChartGridBlock["panels"],
): ChartValueRange {
  const values = panels.flatMap((panel) => panel.series.flatMap((series) => series.values))
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const [from, to] =
    chartKind === "bar"
      ? [Math.min(0, low), Math.max(0, high)]
      : paddedRange(low, high, CHART_LINE_PADDING_RATE)
  const width = to - from === 0 ? Math.max(Math.abs(to), 1) : to - from
  const step = niceStep(width / CHART_GRID_TICK_COUNT)
  const min = roundedTick(Math.floor(from / step) * step)
  const max = roundedTick(Math.ceil(to / step) * step)
  return { min, max: max > min ? max : roundedTick(min + step) }
}

function paddedRange(low: number, high: number, rate: number): readonly [number, number] {
  const padding = high === low ? Math.max(Math.abs(high), 1) * rate : (high - low) * rate
  return [low - padding, high + padding]
}

/** 刻みを 1・2・5 の 10 の冪倍に丸める。 */
function niceStep(raw: number): number {
  const exponent = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / exponent
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * exponent
}

/** 刻みの掛け算で出る 0.30000000000000004 のような端数を落とす。 */
function roundedTick(value: number): number {
  return Number(value.toPrecision(12))
}
