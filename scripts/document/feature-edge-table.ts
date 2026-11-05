// サーバの機能どうしのエッジの表と依存図を、`.dependency-cruiser.cjs` の `server-feature-edge:` の規則から組み立てる。
// 範囲は、開始と終了の印のコメントに挟まれた行。

import { createRequire } from "node:module"

import { rewriteMarkedTable, type MarkedTable } from "./figure-decision-table.ts"

/** `.dependency-cruiser.cjs` の `forbidden` の規則のうち、この表が読む欄。 */
export type EdgeRule = {
  readonly name: string
  readonly to: { readonly pathNot?: string }
}

const RULE_PREFIX = "server-feature-edge:"
const ALLOWED_PATTERN = /^\^src\/server\/\(\?:(.+)\)\/$/u
const LEAF_ROW_NAME = "そのほか"

/** `forbidden` の機能ごとの規則から、表（見出しと行）を組み立てる。規則が無ければ throw。 */
export function buildFeatureEdgeTable(forbidden: readonly EdgeRule[]): MarkedTable {
  const { withEdges, leaves } = parseFeatureEdges(forbidden)
  return {
    start: "<!-- feature-edge-table:start -->",
    end: "<!-- feature-edge-table:end -->",
    columns: ["機能（import する側）", "読んでよい機能"],
    rows: [
      ...withEdges.map((edge) => [quoted([edge.feature]), quoted(edge.allowed)]),
      [LEAF_ROW_NAME, `—（葉。${quoted(leaves.map((edge) => edge.feature))}）`],
    ],
  }
}

export const FEATURE_GRAPH_START = "<!-- feature-edge-graph:start -->"
export const FEATURE_GRAPH_END = "<!-- feature-edge-graph:end -->"

/** `forbidden` の機能ごとの規則から、Mermaid の `flowchart LR` の本文（コードブロックの中身）を組み立てる。規則が無ければ throw。 */
export function buildFeatureEdgeGraph(forbidden: readonly EdgeRule[]): string {
  const { withEdges, leaves } = parseFeatureEdges(forbidden)
  return [
    "flowchart LR",
    ...withEdges.map((edge) => `  ${nodeId(edge.feature)}["${edge.feature}"]`),
    '  subgraph leaves["末端（import しない機能）"]',
    ...leaves.map((edge) => `    ${nodeId(edge.feature)}["${edge.feature}"]`),
    "  end",
    ...withEdges.flatMap((edge) =>
      edge.allowed.map((to) => `  ${nodeId(edge.feature)} --> ${nodeId(to)}`),
    ),
  ].join("\n")
}

/** 文書の印に挟まれた範囲を、機能の依存図のコードブロックに書き直す。印が無ければ変えない。 */
export function rewriteFeatureEdgeGraph(text: string, graph: string): string {
  const start = text.indexOf(FEATURE_GRAPH_START)
  const end = text.indexOf(FEATURE_GRAPH_END)
  if (start < 0 || end < start) {
    return text
  }
  return `${text.slice(0, start + FEATURE_GRAPH_START.length)}\n\n\`\`\`mermaid\n${graph}\n\`\`\`\n\n${text.slice(end)}`
}

/** 文書に置く依存図の本文。`.dependency-cruiser.cjs` から読む。 */
export function readFeatureEdgeGraph(): string {
  return buildFeatureEdgeGraph(readForbidden())
}

/** 文書に置く表。`.dependency-cruiser.cjs` から読む。 */
export function readFeatureEdgeTable(): MarkedTable {
  return buildFeatureEdgeTable(readForbidden())
}

/** 文書の印に挟まれた範囲を、機能どうしのエッジの表に書き直す。印が無ければ変えない。 */
export function rewriteFeatureEdgeTable(text: string): string {
  return rewriteMarkedTable(text, readFeatureEdgeTable())
}

type FeatureEdge = { readonly feature: string; readonly allowed: readonly string[] }

/** 機能ごとの規則を、辺を持つ機能と末端の機能に分けて読む。規則が無ければ throw。 */
function parseFeatureEdges(forbidden: readonly EdgeRule[]): {
  readonly withEdges: readonly FeatureEdge[]
  readonly leaves: readonly FeatureEdge[]
} {
  const rules = forbidden.filter((rule) => rule.name.startsWith(RULE_PREFIX))
  if (rules.length === 0) {
    throw new Error(`${RULE_PREFIX} で始まる規則が無い`)
  }
  const edges = rules.map((rule) => ({
    feature: rule.name.slice(RULE_PREFIX.length),
    allowed: allowedFeatures(rule),
  }))
  return {
    withEdges: edges.filter((edge) => edge.allowed.length > 0),
    leaves: edges.filter((edge) => edge.allowed.length === 0),
  }
}

/** 規則の `to.pathNot` の `(?:自分|許す先…)` から、許す先（自分を除く）を並びのまま取り出す。 */
function allowedFeatures(rule: EdgeRule): string[] {
  const alternatives = ALLOWED_PATTERN.exec(rule.to.pathNot ?? "")?.[1]
  if (alternatives === undefined) {
    throw new Error(`${rule.name} の to.pathNot を読めない`)
  }
  return alternatives.split("|").slice(1)
}

function readForbidden(): readonly EdgeRule[] {
  const config: { readonly forbidden: readonly EdgeRule[] } = createRequire(import.meta.url)(
    "../../.dependency-cruiser.cjs",
  )
  return config.forbidden
}

function nodeId(feature: string): string {
  return feature.replaceAll("-", "_")
}

function quoted(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(" ")
}
