// サーバの機能どうしの辺の表を、`.dependency-cruiser.cjs` の `server-feature-edge:` の規則から組み立てる。
// 表の範囲は、開始と終了の印のコメントに挟まれた行。

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
  const rules = forbidden.filter((rule) => rule.name.startsWith(RULE_PREFIX))
  if (rules.length === 0) {
    throw new Error(`${RULE_PREFIX} で始まる規則が無い`)
  }
  const edges = rules.map((rule) => ({
    feature: rule.name.slice(RULE_PREFIX.length),
    allowed: allowedFeatures(rule),
  }))
  const withEdges = edges.filter((edge) => edge.allowed.length > 0)
  const leaves = edges.filter((edge) => edge.allowed.length === 0)
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

/** 文書に置く表。`.dependency-cruiser.cjs` から読む。 */
export function readFeatureEdgeTable(): MarkedTable {
  const config: { readonly forbidden: readonly EdgeRule[] } = createRequire(import.meta.url)(
    "../../.dependency-cruiser.cjs",
  )
  return buildFeatureEdgeTable(config.forbidden)
}

/** 文書の印に挟まれた範囲を、機能どうしの辺の表に書き直す。印が無ければ変えない。 */
export function rewriteFeatureEdgeTable(text: string): string {
  return rewriteMarkedTable(text, readFeatureEdgeTable())
}

/** 規則の `to.pathNot` の `(?:自分|許す先…)` から、許す先（自分を除く）を並びのまま取り出す。 */
function allowedFeatures(rule: EdgeRule): string[] {
  const alternatives = ALLOWED_PATTERN.exec(rule.to.pathNot ?? "")?.[1]
  if (alternatives === undefined) {
    throw new Error(`${rule.name} の to.pathNot を読めない`)
  }
  return alternatives.split("|").slice(1)
}

function quoted(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(" ")
}
