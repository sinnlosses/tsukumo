// 塊の基準の「図の決定表」の3つの表を、`FIGURE_DECISION_ROWS`・`FIGURE_HARD_RULES`・`CARDINALITY_BOUNDS` から組み立てる純粋関数。
// 表の範囲は、開始と終了の印のコメントに挟まれた行。

import {
  CARDINALITY_BOUNDS,
  FIGURE_DECISION_ROWS,
  FIGURE_HARD_RULES,
} from "../../src/shared/report/figure-decision.ts"

type MarkedTable = {
  readonly start: string
  readonly end: string
  readonly columns: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/** 決定表の表。`rows` は見出しの行と区切りの行を含まない。 */
const FIGURE_DECISION_TABLE = {
  start: "<!-- figure-decision-table:start -->",
  end: "<!-- figure-decision-table:end -->",
  columns: ["#", "名前", "条件", "図派", "文派", "必須の注記"],
  rows: FIGURE_DECISION_ROWS.map((row, index) => [
    String(index + 1),
    `\`${row.name}\``,
    row.condition,
    `\`${row.chart}\``,
    `\`${row.text}\``,
    `\`${row.note}\``,
  ]),
} as const satisfies MarkedTable

/** 置いてはならない形の規則のセル。 */
const FIGURE_HARD_RULE_TABLE = {
  start: "<!-- figure-hard-rule-table:start -->",
  end: "<!-- figure-hard-rule-table:end -->",
  columns: ["名前", "置かない形"],
  rows: FIGURE_HARD_RULES.map((rule) => [`\`${rule.name}\``, rule.rule]),
} as const satisfies MarkedTable

/** 基数の境のセル。 */
const CARDINALITY_BOUND_TABLE = {
  start: "<!-- cardinality-bound-table:start -->",
  end: "<!-- cardinality-bound-table:end -->",
  columns: ["名前", "値"],
  rows: Object.entries(CARDINALITY_BOUNDS).map(([name, value]) => [`\`${name}\``, String(value)]),
} as const satisfies MarkedTable

/** 文書に置く3つの表。 */
export const FIGURE_DECISION_TABLES = [
  FIGURE_DECISION_TABLE,
  FIGURE_HARD_RULE_TABLE,
  CARDINALITY_BOUND_TABLE,
] as const satisfies readonly MarkedTable[]

/** 文書の3つの印に挟まれた範囲を、それぞれの表に書き直す。印が無い表は変えない。 */
export function rewriteFigureDecisionTables(text: string): string {
  return FIGURE_DECISION_TABLES.reduce<string>(rewriteMarkedTable, text)
}

/** 文書の印に挟まれた表の、いま書かれている行のセル。印が無ければ空。 */
export function readMarkedRows(
  text: string,
  table: Pick<MarkedTable, "start" | "end">,
): readonly (readonly string[])[] {
  const start = text.indexOf(table.start)
  const end = text.indexOf(table.end)
  if (start < 0 || end < start) {
    return []
  }
  return text
    .slice(start + table.start.length, end)
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, line.lastIndexOf("|"))
        .split("|")
        .map((cell) => cell.trim()),
    )
}

function rewriteMarkedTable(text: string, table: MarkedTable): string {
  const start = text.indexOf(table.start)
  const end = text.indexOf(table.end)
  if (start < 0 || end < start) {
    return text
  }
  const body = [
    `| ${table.columns.join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
    ...table.rows.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n")
  return `${text.slice(0, start + table.start.length)}\n\n${body}\n\n${text.slice(end)}`
}
