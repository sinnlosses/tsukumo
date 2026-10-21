// 図の塊（`chart`・`graph`・`svg`・`mermaid`）の本体を組む。Chart.js の設定・flowchart のソース・SVG・凡例を持つ。

import { readGraphSource, type GraphChange, type GraphNodeShape } from "./graph-source.ts"
import type { ReportGraph } from "./report-block-diagram.ts"
import type { ReportBlock } from "./report-block.ts"
import { htmlInline } from "./report-inline-markdown.ts"

type ChartConfig = {
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
    | { readonly indexAxis: "y" }
    | Record<string, never>
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

type DirectLabelPlugins = {
  readonly "tsukumo-direct-label": {
    readonly mode: "arrow" | "slope" | "span" | "share"
    readonly names: readonly string[]
  }
}

const ARROW_BAR_THICKNESS = 4
const SPAN_BAR_THICKNESS = 12
const SHARE_BAR_THICKNESS = 36

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
        plugins: { "tsukumo-direct-label": { mode: "share", names: [] } },
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
  return {
    type: block.chartKind,
    data: {
      labels: [...block.labels],
      datasets: series.map(({ name, values }) => ({ label: name, data: [...values] })),
    },
    options: block.chartKind === "bar" && block.horizontal ? { indexAxis: "y" } : {},
  }
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
  const mermaidId = (index: number): string => `n${String(index)}`
  const quoted = (label: string): string =>
    `"${label.replaceAll('"', "#quot;").replaceAll("`", "#96;")}"`
  const nodeLine = (index: number, indent: string): string => {
    const node = nodes[index]
    if (node === undefined) {
      return ""
    }
    const label = quoted(node.name)
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
  const groupStyleLines = groups.map((_, index) => `  style g${String(index)} ${GRAPH_GROUP_STYLE}`)
  const edgeLines = edges.map((edge) => {
    const arrow = edge.label === "" ? "-->" : `-->|${quoted(edge.label)}|`
    return `  ${mermaidId(edge.from)} ${arrow} ${mermaidId(edge.to)}`
  })
  const changes = new Set([...nodes, ...edges].map(({ change }) => change))
  const classDefLines = GRAPH_CHANGES.filter(({ change }) => changes.has(change)).map(
    ({ change, color, dashed }) => `  classDef ${change} ${graphStroke(color, dashed, 3)}`,
  )
  const classLines = nodes.flatMap((node, index) =>
    node.change === "unchanged" ? [] : [`  class ${mermaidId(index)} ${node.change}`],
  )
  const linkStyleLines = edges.flatMap((edge, index) => {
    const style = GRAPH_CHANGES.find(({ change }) => change === edge.change)
    return style === undefined
      ? []
      : [`  linkStyle ${String(index)} ${graphStroke(style.color, style.dashed, 2)}`]
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

const GRAPH_SHAPES = [
  { shape: "round", label: "入口・出口" },
  { shape: "box", label: "処理" },
  { shape: "decision", label: "分岐" },
] as const satisfies readonly { readonly shape: GraphNodeShape; readonly label: string }[]

export function graphLegendMarkdown(block: ReportGraph): string {
  const { nodes, edges } = readGraphSource(block.source)
  const shapes = GRAPH_SHAPES.filter(({ shape }) => nodes.some((node) => node.shape === shape))
  const shapeItems = shapes.length < 2 ? [] : shapes
  const changeItems = [...nodes, ...edges].every(({ change }) => change === "unchanged")
    ? []
    : GRAPH_CHANGES
  const items = [
    ...shapeItems.map(
      ({ shape, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-shape graph-legend-shape-${shape}" aria-hidden="true"></span>${label}</span>`,
    ),
    ...changeItems.map(
      ({ change, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-${change}" aria-hidden="true"></span>${label}</span>`,
    ),
  ]
  return items.length === 0 ? "" : `<div class="graph-legend">${items.join("")}</div>`
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
      return shape.label.trim() === ""
        ? rect
        : rect +
            (shape.labelAt === "top-left"
              ? svgTextHtml(
                  shape.x + SVG_LABEL_INSET,
                  shape.y + SVG_LABEL_FONT_SIZE + SVG_LABEL_TOP_GAP,
                  shape.label,
                  { centered: false },
                )
              : svgTextHtml(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.label, {
                  centered: true,
                }))
    }
    case "line": {
      const markerEnd = shape.arrow ? ` marker-end="url(#${SVG_ARROW_MARKER_ID})"` : ""
      const line = `<line x1="${String(shape.x1)}" y1="${String(shape.y1)}" x2="${String(shape.x2)}" y2="${String(shape.y2)}"${markerEnd}></line>`
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
  const anchor = centered ? ' text-anchor="middle" dominant-baseline="middle"' : ""
  return `<text x="${String(x)}" y="${String(y)}" font-size="${String(SVG_LABEL_FONT_SIZE)}"${anchor}>${htmlInline(text)}</text>`
}

function graphStroke(color: string, dashed: boolean, width: number): string {
  const dash = dashed ? ",stroke-dasharray:5 4" : ""
  return `stroke:var(${color}),stroke-width:${String(width)}px${dash}`
}
