// `graph` の塊を mermaid の flowchart のソースと凡例にする。配色（群の地・色の目印・戻り道）の規則もここが持つ。

import {
  readGraphSource,
  type GraphChange,
  type GraphNodeShape,
  type GraphSourceGroup,
  type GraphTone,
} from "./graph-source.ts"
import type { ReportGraph } from "./report-block-diagram.ts"
import { htmlInline } from "./report-inline-markdown.ts"

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
  const groundOf = groupGrounds(groups)
  const groupStyleLines = groups.map(
    (group, index) =>
      `  style g${String(index)} ${group.tone === "none" ? graphGroundStyle(groundOf[index] ?? 1) : graphToneGroupStyle(group.tone)}`,
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
    ).map(
      ({ tone, color, fill }) =>
        `  classDef tone-${tone} fill:var(${fill}),${graphStroke(color, false, 3)}`,
    ),
  ]
  const classLines = nodes.flatMap((node, index) => {
    if (node.change !== "unchanged") {
      return [`  class ${mermaidId(index)} ${node.change}`]
    }
    return node.tone === "none" ? [] : [`  class ${mermaidId(index)} tone-${node.tone}`]
  })
  const linkStyleLines = edges.flatMap((edge, index) => {
    const style = GRAPH_CHANGES.find(({ change }) => change === edge.change)
    const color =
      style?.color ??
      (edge.returns ? GRAPH_RETURN_COLOR : undefined) ??
      GRAPH_TONES.find(({ tone }) => tone === edge.tone)?.color
    const dashed = (style?.dashed ?? false) || edge.dashed || edge.returns
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

const GRAPH_RETURN_COLOR = "--graph-return"

/** 色の目印の無い群に順に当てる地の色の数（`--graph-ground-1` 〜）。 */
const GRAPH_GROUND_COUNT = 3

/** 色の目印 → 系列色のトークン（`svg` の `tone` と同じ）と、節点の地のトークン。 */
const GRAPH_TONES = [
  { tone: "a", color: "--chart-series-1", fill: "--graph-tone-fill-a" },
  { tone: "b", color: "--chart-series-2", fill: "--graph-tone-fill-b" },
  { tone: "c", color: "--chart-series-3", fill: "--graph-tone-fill-c" },
  { tone: "d", color: "--chart-series-4", fill: "--graph-tone-fill-d" },
  { tone: "e", color: "--chart-series-5", fill: "--graph-tone-fill-e" },
] as const satisfies readonly {
  readonly tone: GraphTone
  readonly color: string
  readonly fill: string
}[]

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
  const returnItems = edges.some((edge) => edge.returns)
    ? [
        `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-return" aria-hidden="true"></span>戻り道</span>`,
      ]
    : []
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
    ...returnItems,
    ...toneItems,
  ]
  return items.length === 0 ? "" : `<div class="graph-legend">${items.join("")}</div>`
}

/** 群ごとの地の色の番号（1〜）。色の目印のある群は数えず 0。 */
export function groupGrounds(groups: readonly GraphSourceGroup[]): readonly number[] {
  let next = 0
  return groups.map((group) => {
    if (group.tone !== "none") {
      return 0
    }
    next += 1
    return ((next - 1) % GRAPH_GROUND_COUNT) + 1
  })
}

function graphGroundStyle(ground: number): string {
  return `fill:var(--graph-ground-${String(ground)}),stroke:var(--rule-quiet),stroke-width:1px`
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

function graphStroke(color: string, dashed: boolean, width: number): string {
  const dash = dashed ? ",stroke-dasharray:5 4" : ""
  return `stroke:var(${color}),stroke-width:${String(width)}px${dash}`
}
