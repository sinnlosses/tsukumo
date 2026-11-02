import type { Nodes, Root } from "mdast"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { KeyFigures } from "../../../../shared/report/report-block-comparison.ts"
import type { ReportCheck } from "../../../../shared/report/report-check.ts"
import type { ReportTask } from "../../../../shared/report/report-task.ts"
import type { WorkPlanClosing } from "../../../../shared/session/work-plan.ts"

/** 検査にかけるレポート。`checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  /** `conclusion` の要素ごとの字数（`ParsedConclusion`）。 */
  readonly conclusionSentenceChars: readonly number[]
  /** 結論の直下に並べる数。「無い」は空の配列。 */
  readonly keyFigures: KeyFigures
  /** 検査が節・図・振り返りの葉を取り出す部品の一覧（`reportOutline`）。「無い」は空の配列。 */
  readonly components: readonly A2uiReportComponent[]
  readonly favor: string
  readonly checks: readonly ReportCheck[]
  /** `code` の塊の `path` → 読めたファイルの中身。読めなかった `path` は入らない。 */
  readonly fileContents: ReadonlyMap<string, string>
  /** 載せたタスク。記法の検査には使わず、段の残りの差し戻し（`ReportReview`）が終わり方を読む。 */
  readonly task: ReportTask
  /** 段の閉じ方。記法の検査には使わず、段の閉じ方の差し戻し（`ReportReview`）が読む。 */
  readonly workPlanClosing: WorkPlanClosing
}

// モデルが書いた Markdown を構文木（mdast）にする読み。
//
// 組はブラウザの `ReportMarkdown` の remark の段（`remark-gfm`・`remark-cjk-friendly`）にそろえる。
// そろえないと、ブラウザが描く形とサーバの判定が食い違う。

const MARKDOWN_PARSER = unified().use(remarkParse).use(remarkGfm).use(remarkCjkFriendly).freeze()

export function markdownTreeOf(markdown: string): Root {
  return MARKDOWN_PARSER.parse(markdown)
}

/** 木の節点を文書の順（親が先）に並べたもの。 */
export function nodesInOrder(node: Nodes): readonly Nodes[] {
  return [node, ...("children" in node ? node.children.flatMap(nodesInOrder) : [])]
}

/** `text` ノードの字数の合計。インラインコード・リンクの URL・記法の記号は数えない。 */
export function textLengthOf(markdown: string): number {
  return nodesInOrder(markdownTreeOf(markdown)).reduce(
    (total, node) => total + (node.type === "text" ? [...node.value].length : 0),
    0,
  )
}

/** インラインコード（バッククォートを含む）を `filler` に置き換えた元の文字。 */
export function withoutInlineCode(markdown: string, filler: string): string {
  const spans = nodesInOrder(markdownTreeOf(markdown)).flatMap((node) =>
    node.type === "inlineCode" &&
    node.position?.start.offset !== undefined &&
    node.position.end.offset !== undefined
      ? [{ start: node.position.start.offset, end: node.position.end.offset }]
      : [],
  )
  const final = spans.reduce(
    (state, span) => ({
      text: state.text + markdown.slice(state.from, span.start) + filler,
      from: span.end,
    }),
    { text: "", from: 0 },
  )
  return final.text + markdown.slice(final.from)
}

// 文中の数の数え方。記録（結論に効く数）と雛形の検査が同じ結論に同じ数を出すよう、1 か所に置く。

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g

/** 文中の数（数字の連なり）の数。インラインコードの中は数えない。 */
export function numberCountOutsideCode(markdown: string): number {
  return nodesInOrder(markdownTreeOf(markdown)).reduce(
    (total, node) =>
      total + (node.type === "text" ? (node.value.match(NUMBER_PATTERN)?.length ?? 0) : 0),
    0,
  )
}
