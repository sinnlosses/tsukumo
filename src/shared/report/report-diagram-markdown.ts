// 図の塊（`chart`・`svg`・`mermaid`）の本体を組む。Chart.js の設定・SVG・凡例を持つ（`graph` は `graphSource`）。

import type { ReportBlock } from "./report-block.ts"
import { htmlInline } from "./report-inline-markdown.ts"

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
  readonly "tsukumo-series": { readonly emphasis: readonly number[] }
}

type DirectLabelPlugins = {
  readonly "tsukumo-direct-label": {
    readonly mode: "arrow" | "slope" | "span" | "share" | "values"
    readonly names: readonly string[]
  }
}

const ARROW_BAR_THICKNESS = 4
const SPAN_BAR_THICKNESS = 12
const SHARE_BAR_THICKNESS = 36
const CHART_MIN_HEIGHT = 320
const CHART_ROW_HEIGHT = 28
const CHART_FRAME_HEIGHT = 48

/**
 * `chart` の塊から Chart.js の設定を組む。色は書かない。`pie` は `series` の先頭だけを描く。
 * `arrow` は前→後を浮き棒1本ずつ、`slope` は項目ごとに前→後の線1本にして、描く側の plugin に系列名を渡す。
 * `span` は項目ごとの始まり〜終わりを矢じりの無い太い浮き棒にする。`share` は先頭の系列を百分率にして、部分ごとに1系列の積み上げ横棒1本にする。
 * どれも項目名・部分の名前は plugin が書くので、縦の軸（`y`）は出さない。
 * `annotation.values` は `plot` 由来の印で、line は線端に系列名と終点の値、pie は項目名と値を plugin に書かせる。
 */
export function chartConfigOf(
  block: Extract<ReportBlock, { readonly kind: "chart" }>,
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
    const plugins = { "tsukumo-direct-label": { mode: block.chartKind, names } }
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
        ...seriesPluginsOf(block),
      },
      tsukumo: {
        height: Math.max(
          CHART_MIN_HEIGHT,
          block.labels.length * CHART_ROW_HEIGHT + CHART_FRAME_HEIGHT,
        ),
      },
    }
  }
  if (annotation.values && (block.chartKind === "line" || block.chartKind === "pie")) {
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
  return { type: block.chartKind, data, options: { ...seriesPluginsOf(block) } }
}

type SvgFigure = {
  readonly width: number
  readonly height: number
  readonly shapes: readonly SvgShape[]
  readonly legend: Extract<ReportBlock, { readonly kind: "svg" }>["legend"]
}

type SvgShape = Extract<ReportBlock, { readonly kind: "svg" }>["shapes"][number]

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
      readonly tone: SvgTone | undefined
    }
  | {
      readonly kind: "line"
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly arrow: boolean
      readonly dashed: boolean
      readonly tone: SvgTone | undefined
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

/**
 * 図形を `<svg viewBox="0 0 W H">` の1行に組む（空行を挟むと Markdown の HTML の塊が切れる）。
 * 色は書かない。`report-svg-figure` の下の要素に CSS が当てる（強調の枠は `stroke-width`、`tone` は `data-tone` の属性が目印）。
 * `legend` は図の下に、色の見本と名前の並びで出す。
 */
export function svgHtml(figure: SvgFigure): string {
  const drawing = svgDrawingOf(figure)
  const w = String(drawing.width)
  const h = String(drawing.height)
  const marker =
    `<defs><marker id="${drawing.arrowMarkerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>`
  const body = drawing.primitives.map(svgPrimitiveHtml).join("")
  return `<div class="svg-figure"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${marker}${body}</svg></div>${svgLegendHtml(drawing.legend)}`
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
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  return values.map((value) => (total > 0 ? (Math.max(0, value) / total) * 100 : 0))
}

function svgLegendHtml(legend: SvgFigure["legend"]): string {
  if (legend.length === 0) return ""
  const items = legend
    .map(
      ({ tone, label }) =>
        `<span class="svg-legend-item"><svg viewBox="0 0 16 12" width="16" height="12"><rect data-tone="${tone}" x="1" y="1" width="14" height="10" rx="2"></rect></svg>${htmlInline(label)}</span>`,
    )
    .join("")
  return `<div class="svg-legend">${items}</div>`
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

function toneAttribute(tone: SvgTone | undefined): string {
  return tone === undefined ? "" : ` data-tone="${tone}"`
}

function svgPrimitiveHtml(primitive: SvgPrimitive): string {
  switch (primitive.kind) {
    case "rect": {
      const strokeWidth = primitive.emphasis ? ' stroke-width="3"' : ""
      return `<rect x="${String(primitive.x)}" y="${String(primitive.y)}" width="${String(primitive.width)}" height="${String(primitive.height)}" rx="4"${strokeWidth}${toneAttribute(primitive.tone)}></rect>`
    }
    case "line": {
      const markerEnd = primitive.arrow ? ` marker-end="url(#${SVG_ARROW_MARKER_ID})"` : ""
      const dashArray = primitive.dashed ? ' stroke-dasharray="6 4"' : ""
      return `<line x1="${String(primitive.x1)}" y1="${String(primitive.y1)}" x2="${String(primitive.x2)}" y2="${String(primitive.y2)}"${markerEnd}${dashArray}${toneAttribute(primitive.tone)}></line>`
    }
    case "text": {
      const anchor = primitive.centered ? ' text-anchor="middle" dominant-baseline="middle"' : ""
      const sub = primitive.sub ? " data-sub" : ""
      return `<text x="${String(primitive.x)}" y="${String(primitive.y)}" font-size="${String(primitive.fontSize)}"${anchor}${sub}>${htmlInline(primitive.text)}</text>`
    }
  }
}

/**
 * `emphasis` の項目を、`labels` の何番目かの並びにして描く側の plugin に渡す。
 * 効くのは bar・pie・share だけで、`emphasis` が空ならなにも足さない。
 */
function seriesPluginsOf(
  block: Extract<ReportBlock, { readonly kind: "chart" }>,
): { readonly plugins: SeriesPlugins } | Record<string, never> {
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
