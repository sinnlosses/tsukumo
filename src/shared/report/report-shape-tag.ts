// 形の札（節が表す内容の形）と、札ごとに使ってよい塊・許さない塊の表。

import type { ReportBlock } from "./report-block.ts"

export const REPORT_SHAPE_TAGS = [
  "cause",
  "connection",
  "position",
  "state",
  "time",
  "order",
  "quantity",
  "choice",
  "attribute",
  "mapping",
  "comparison",
  "boundary",
  "parallel",
  "single",
] as const

export type ReportShapeTag = (typeof REPORT_SHAPE_TAGS)[number]

/** 読み戻した札。`unspecified` は札を省いた節（欄の無かった頃の transcript を含む）。 */
export type RecordedReportShapeTag = ReportShapeTag | "unspecified"

/** 札の第一候補・許す代替の塊。`sample` は条8の表に出す見本で、無ければ空。 */
export type ShapeTagBlock = {
  readonly kind: ReportBlock["kind"]
  readonly sample: string
}

/**
 * 札が許さない塊。下の段（`table`・`list`・`text`）だけを塞ぐ。
 * - always: その種類なら常に
 * - numbers-at-least-3: インラインコードの外の数字の並びが3つ以上の `text`
 * - attributes-at-most-1: 列が2つ以下（項目名と属性1つ以下）の `table`
 * - single-item: 項目が1つの `list`
 */
export type ForbiddenBlock =
  | { readonly kind: "table" | "list" | "text"; readonly when: "always" }
  | { readonly kind: "text"; readonly when: "numbers-at-least-3" }
  | { readonly kind: "table"; readonly when: "attributes-at-most-1" }
  | { readonly kind: "list"; readonly when: "single-item" }

export type ShapeTagRule = {
  readonly name: string
  readonly primary: readonly ShapeTagBlock[]
  readonly alternatives: readonly ShapeTagBlock[]
  readonly forbidden: readonly ForbiddenBlock[]
}

/**
 * 札ごとの表。属性の並び・対応の「文のセル」は、受理の前に `sentence-table` の差し戻しが塞ぐので `forbidden` に置かない。
 */
export const REPORT_SHAPE_TAG_RULES = {
  cause: {
    name: "因果",
    primary: [{ kind: "graph", sample: "A -> B: 語" }],
    alternatives: [{ kind: "text", sample: "" }],
    forbidden: [
      { kind: "list", when: "always" },
      { kind: "table", when: "always" },
    ],
  },
  connection: {
    name: "つながり",
    primary: [{ kind: "graph", sample: "A -> B: 語" }],
    alternatives: [
      { kind: "matrix", sample: "" },
      { kind: "mermaid", sample: "mindmap" },
    ],
    forbidden: [
      { kind: "list", when: "always" },
      { kind: "table", when: "always" },
    ],
  },
  position: {
    name: "位置",
    primary: [
      { kind: "image", sample: "" },
      { kind: "svg", sample: "" },
    ],
    alternatives: [{ kind: "dimension", sample: "" }],
    forbidden: [
      { kind: "table", when: "always" },
      { kind: "list", when: "always" },
      { kind: "text", when: "always" },
    ],
  },
  state: {
    name: "状態",
    primary: [{ kind: "mermaid", sample: "stateDiagram-v2" }],
    alternatives: [{ kind: "matrix", sample: "" }],
    forbidden: [
      { kind: "list", when: "always" },
      { kind: "table", when: "always" },
    ],
  },
  time: {
    name: "時間",
    primary: [{ kind: "mermaid", sample: "sequenceDiagram" }],
    alternatives: [
      { kind: "mermaid", sample: "gantt" },
      { kind: "list", sample: "ordered" },
    ],
    forbidden: [{ kind: "table", when: "always" }],
  },
  order: {
    name: "順序",
    primary: [{ kind: "list", sample: "ordered" }],
    alternatives: [{ kind: "graph", sample: "" }],
    forbidden: [{ kind: "table", when: "always" }],
  },
  quantity: {
    name: "量",
    primary: [{ kind: "chart", sample: "" }],
    alternatives: [
      { kind: "stats", sample: "" },
      { kind: "table", sample: "" },
    ],
    forbidden: [
      { kind: "list", when: "always" },
      { kind: "text", when: "numbers-at-least-3" },
    ],
  },
  choice: {
    name: "選択",
    primary: [{ kind: "options", sample: "" }],
    alternatives: [
      { kind: "table", sample: "" },
      { kind: "mermaid", sample: "quadrantChart" },
    ],
    forbidden: [{ kind: "list", when: "always" }],
  },
  attribute: {
    name: "属性の並び",
    primary: [{ kind: "table", sample: "" }],
    alternatives: [{ kind: "matrix", sample: "" }],
    forbidden: [],
  },
  mapping: {
    name: "対応",
    primary: [{ kind: "table", sample: "" }],
    alternatives: [{ kind: "graph", sample: "" }],
    forbidden: [],
  },
  comparison: {
    name: "見比べ",
    primary: [{ kind: "compare", sample: "" }],
    alternatives: [{ kind: "table", sample: "" }],
    forbidden: [{ kind: "list", when: "always" }],
  },
  boundary: {
    name: "境界",
    primary: [{ kind: "compare", sample: "" }],
    alternatives: [{ kind: "table", sample: "" }],
    forbidden: [{ kind: "text", when: "always" }],
  },
  parallel: {
    name: "並列",
    primary: [{ kind: "list", sample: "" }],
    alternatives: [],
    forbidden: [{ kind: "table", when: "attributes-at-most-1" }],
  },
  single: {
    name: "一言",
    primary: [{ kind: "text", sample: "" }],
    alternatives: [],
    forbidden: [{ kind: "list", when: "single-item" }],
  },
} as const satisfies Record<ReportShapeTag, ShapeTagRule>

/** 札が許さない塊か。許さない塊は下の段（`table`・`list`・`text`）だけ。 */
export function isForbiddenBlock(
  tag: ReportShapeTag,
  block: ReportBlock,
): block is Extract<ReportBlock, { readonly kind: ForbiddenBlock["kind"] }> {
  const rules: readonly ForbiddenBlock[] = REPORT_SHAPE_TAG_RULES[tag].forbidden
  return rules.some((rule) => rule.kind === block.kind && meetsCondition(rule, block))
}

const INLINE_CODE = /(`+)[\s\S]*?\1/g

const NUMBER = /\d+(?:[.,]\d+)*/g

function meetsCondition(rule: ForbiddenBlock, block: ReportBlock): boolean {
  switch (rule.when) {
    case "always":
      return true
    case "numbers-at-least-3":
      return (
        block.kind === "text" &&
        (block.text.replace(INLINE_CODE, "").match(NUMBER)?.length ?? 0) >= 3
      )
    case "attributes-at-most-1":
      return block.kind === "table" && block.columns.length <= 2
    case "single-item":
      return block.kind === "list" && block.items.length === 1
  }
}
