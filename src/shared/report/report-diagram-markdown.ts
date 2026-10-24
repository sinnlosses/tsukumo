// 図の塊（`chart`・`graph`・`svg`・`mermaid`）の本体を組む。Chart.js の設定・flowchart のソース・SVG・凡例を持つ。

import {
  readGraphSource,
  type GraphChange,
  type GraphNodeShape,
  type GraphTone,
} from "./graph-source.ts"
import type { ReportGraph } from "./report-block-diagram.ts"
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
    readonly mode: "arrow" | "slope" | "span" | "share"
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
 */
export function chartConfigOf(
  block: Extract<ReportBlock, { readonly kind: "chart" }>,
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

/**
 * 図形を `<svg viewBox="0 0 W H">` の1行に組む（空行を挟むと Markdown の HTML の塊が切れる）。
 * 色は書かない。`report-svg-figure` の下の要素に CSS が当てる（強調の枠は `stroke-width`、`tone` は `data-tone` の属性が目印）。
 * `legend` は図の下に、色の見本と名前の並びで出す。
 */
export function svgHtml({ width, height, shapes, legend }: SvgFigure): string {
  const w = String(width)
  const h = String(height)
  const marker =
    `<defs><marker id="${SVG_ARROW_MARKER_ID}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>`
  const body = shapes.map(svgShapeHtml).join("")
  return `<div class="svg-figure"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${marker}${body}</svg></div>${svgLegendHtml(legend)}`
}

/** 本文から「3 の呼び出し」と指せるよう、時系列の図の矢印に通し番号を振る。書き手が `autonumber` を書いていれば足さない。 */
export function withSequenceAutonumber(source: string): string {
  const [head = "", ...rest] = source.split("\n")
  if (head.trim() !== "sequenceDiagram" || rest.some((line) => /^\s*autonumber\b/.test(line))) {
    return source
  }
  return ["sequenceDiagram", "  autonumber", ...rest].join("\n")
}

/**
 * 書き手の名前は辺を結ぶためだけに使い、ソースの ID は `n0`, `n1` … を振る（`end` などの予約語を避ける）。
 * ラベルは節点も辺も必ず引用符で包む（`@`・`(`・`|` などを構文と読ませない）。
 * 読めない行は呼び出し側が先に差し戻す前提で、ここでは飛ばす。
 */
export function graphSource(block: ReportGraph): string {
  const { nodes, edges, groups } = readGraphSource(block.source)
  const nodeLine = (index: number, indent: string): string => {
    const node = nodes[index]
    if (node === undefined) {
      return ""
    }
    const label = node.note === "" ? quoted(node.name) : noteLabel(node.name, node.note)
    const id = mermaidId(index)
    switch (node.shape) {
      case "box":
        return `${indent}${id}[${label}]`
      case "round":
        return `${indent}${id}([${label}])`
      case "decision":
        return `${indent}${id}{${label}}`
    }
  }
  const grouped = new Set(groups.flatMap((group) => group.nodes))
  const nodeLines = [
    ...nodes.flatMap((_, index) => (grouped.has(index) ? [] : [nodeLine(index, "  ")])),
    ...groups.flatMap((group, index) => [
      `  subgraph g${String(index)}[${quoted(group.name)}]`,
      ...group.nodes.map((at) => nodeLine(at, "    ")),
      "  end",
    ]),
  ]
  const groupStyleLines = groups.map(
    (group, index) =>
      `  style g${String(index)} ${group.tone === "none" ? GRAPH_GROUP_STYLE : graphToneGroupStyle(group.tone)}`,
  )
  const edgeLines = edges.map((edge) => {
    const arrow = edge.label === "" ? "-->" : `-->|${quoted(edge.label)}|`
    return `  ${mermaidId(edge.from)} ${arrow} ${mermaidId(edge.to)}`
  })
  const changes = new Set([...nodes, ...edges].map(({ change }) => change))
  const classDefLines = [
    ...GRAPH_CHANGES.filter(({ change }) => changes.has(change)).map(
      ({ change, color, dashed }) => `  classDef ${change} ${graphStroke(color, dashed, 3)}`,
    ),
    ...GRAPH_TONES.filter(({ tone }) =>
      nodes.some((node) => node.change === "unchanged" && node.tone === tone),
    ).map(({ tone, color }) => `  classDef tone-${tone} ${graphStroke(color, false, 3)}`),
  ]
  const classLines = nodes.flatMap((node, index) => {
    if (node.change !== "unchanged") {
      return [`  class ${mermaidId(index)} ${node.change}`]
    }
    return node.tone === "none" ? [] : [`  class ${mermaidId(index)} tone-${node.tone}`]
  })
  const linkStyleLines = edges.flatMap((edge, index) => {
    const style = GRAPH_CHANGES.find(({ change }) => change === edge.change)
    const color = style?.color ?? GRAPH_TONES.find(({ tone }) => tone === edge.tone)?.color
    const dashed = (style?.dashed ?? false) || edge.dashed
    const properties = [
      ...(color === undefined ? [] : [`stroke:var(${color})`, "stroke-width:2px"]),
      ...(dashed ? ["stroke-dasharray:5 4"] : []),
    ]
    return properties.length === 0 ? [] : [`  linkStyle ${String(index)} ${properties.join(",")}`]
  })
  return [
    `flowchart ${block.direction}`,
    ...nodeLines,
    ...edgeLines,
    ...groupStyleLines,
    ...classDefLines,
    ...classLines,
    ...linkStyleLines,
  ].join("\n")
}

/** 印の色はテーマのトークンで書き、`var(--…)` のまま渡す（hex への解決は `MermaidBlock`）。 */
const GRAPH_CHANGES = [
  { change: "added", color: "--state-ok", label: "足した", dashed: false },
  { change: "removed", color: "--state-ng", label: "消した", dashed: true },
  { change: "changed", color: "--state-warn", label: "変えた", dashed: false },
] as const satisfies readonly {
  readonly change: GraphChange
  readonly color: string
  readonly label: string
  readonly dashed: boolean
}[]

const GRAPH_GROUP_STYLE =
  "fill:var(--surface-raised),stroke:var(--rule-quiet),stroke-width:1px,stroke-dasharray:5 4"

/** 色の目印 → 系列色のトークン（`svg` の `tone` と同じ）。 */
const GRAPH_TONES = [
  { tone: "a", color: "--chart-series-1" },
  { tone: "b", color: "--chart-series-2" },
  { tone: "c", color: "--chart-series-3" },
  { tone: "d", color: "--chart-series-4" },
  { tone: "e", color: "--chart-series-5" },
] as const satisfies readonly { readonly tone: GraphTone; readonly color: string }[]

const GRAPH_SHAPES = [
  { shape: "round", label: "入口・出口" },
  { shape: "box", label: "処理" },
  { shape: "decision", label: "分岐" },
] as const satisfies readonly { readonly shape: GraphNodeShape; readonly label: string }[]

/** `withShapes` が偽なら形の見本を出さない（形を描き分けないカードの連鎖の凡例）。 */
export function graphLegendMarkdown(block: ReportGraph, withShapes = true): string {
  const { nodes, edges } = readGraphSource(block.source)
  const shapes = GRAPH_SHAPES.filter(({ shape }) => nodes.some((node) => node.shape === shape))
  const shapeItems = !withShapes || shapes.length < 2 ? [] : shapes
  const changeItems = [...nodes, ...edges].every(({ change }) => change === "unchanged")
    ? []
    : GRAPH_CHANGES
  const toneItems = block.legend.map(
    ({ tone, label }) =>
      `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-tone-${tone}" aria-hidden="true"></span>${htmlInline(label)}</span>`,
  )
  const items = [
    ...shapeItems.map(
      ({ shape, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-shape graph-legend-shape-${shape}" aria-hidden="true"></span>${label}</span>`,
    ),
    ...changeItems.map(
      ({ change, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-${change}" aria-hidden="true"></span>${label}</span>`,
    ),
    ...toneItems,
  ]
  return items.length === 0 ? "" : `<div class="graph-legend">${items.join("")}</div>`
}

function graphToneGroupStyle(tone: GraphTone): string {
  const color = GRAPH_TONES.find((entry) => entry.tone === tone)?.color ?? "--rule-quiet"
  return `fill:var(--surface-raised),stroke:var(${color}),stroke-width:2px`
}

function mermaidId(index: number): string {
  return `n${String(index)}`
}

/** 名前の下に小さい字で説明を置く節点のラベル。HTML として読まれるので `<` `>` `&` は実体にする。 */
function noteLabel(name: string, note: string): string {
  return quoted(`${escapedForLabel(name)}<br/><small>${escapedForLabel(note)}</small>`)
}

function escapedForLabel(value: string): string {
  return value.replaceAll("&", "#amp;").replaceAll("<", "#lt;").replaceAll(">", "#gt;")
}

function quoted(label: string): string {
  return `"${label.replaceAll('"', "#quot;").replaceAll("`", "#96;")}"`
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

function svgShapeHtml(shape: SvgShape): string {
  switch (shape.kind) {
    case "rect": {
      const strokeWidth = shape.emphasis ? ' stroke-width="3"' : ""
      const toneAttribute = shape.tone === "none" ? "" : ` data-tone="${shape.tone}"`
      const rect = `<rect x="${String(shape.x)}" y="${String(shape.y)}" width="${String(shape.width)}" height="${String(shape.height)}" rx="4"${strokeWidth}${toneAttribute}></rect>`
      if (shape.label.trim() === "") return rect
      const hasSub = shape.sub.trim() !== ""
      if (shape.labelAt === "top-left") {
        const labelY = shape.y + SVG_LABEL_FONT_SIZE + SVG_LABEL_TOP_GAP
        const sub = hasSub
          ? svgSubTextHtml(shape.x + SVG_LABEL_INSET, labelY + SVG_SUB_LINE_GAP, shape.sub, {
              centered: false,
            })
          : ""
        return (
          rect +
          svgTextHtml(shape.x + SVG_LABEL_INSET, labelY, shape.label, { centered: false }) +
          sub
        )
      }
      const centerX = shape.x + shape.width / 2
      const centerY = shape.y + shape.height / 2
      if (!hasSub) return rect + svgTextHtml(centerX, centerY, shape.label, { centered: true })
      return (
        rect +
        svgTextHtml(centerX, centerY - SVG_SUB_LABEL_SHIFT, shape.label, { centered: true }) +
        svgSubTextHtml(centerX, centerY + SVG_SUB_DROP, shape.sub, { centered: true })
      )
    }
    case "line": {
      const markerEnd = shape.arrow ? ` marker-end="url(#${SVG_ARROW_MARKER_ID})"` : ""
      const dashArray = shape.dashed ? ' stroke-dasharray="6 4"' : ""
      const toneAttribute = shape.tone === "none" ? "" : ` data-tone="${shape.tone}"`
      const line = `<line x1="${String(shape.x1)}" y1="${String(shape.y1)}" x2="${String(shape.x2)}" y2="${String(shape.y2)}"${markerEnd}${dashArray}${toneAttribute}></line>`
      return shape.label.trim() === ""
        ? line
        : line +
            svgTextHtml((shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2 - 6, shape.label, {
              centered: true,
            })
    }
    case "text":
      return svgTextHtml(shape.x, shape.y, shape.text, { centered: false })
  }
}

function svgTextHtml(
  x: number,
  y: number,
  text: string,
  { centered }: { readonly centered: boolean },
): string {
  return svgTextElement(x, y, text, { centered, fontSize: SVG_LABEL_FONT_SIZE, extra: "" })
}

/** `rect` の `sub`。`report-notation/figure.css` が `data-sub` を目印に弱い色を当てる。 */
function svgSubTextHtml(
  x: number,
  y: number,
  text: string,
  { centered }: { readonly centered: boolean },
): string {
  return svgTextElement(x, y, text, { centered, fontSize: SVG_SUB_FONT_SIZE, extra: " data-sub" })
}

function svgTextElement(
  x: number,
  y: number,
  text: string,
  {
    centered,
    fontSize,
    extra,
  }: { readonly centered: boolean; readonly fontSize: number; readonly extra: string },
): string {
  const anchor = centered ? ' text-anchor="middle" dominant-baseline="middle"' : ""
  return `<text x="${String(x)}" y="${String(y)}" font-size="${String(fontSize)}"${anchor}${extra}>${htmlInline(text)}</text>`
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

function graphStroke(color: string, dashed: boolean, width: number): string {
  const dash = dashed ? ",stroke-dasharray:5 4" : ""
  return `stroke:var(${color}),stroke-width:${String(width)}px${dash}`
}
