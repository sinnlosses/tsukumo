// モデルが書いた Markdown を構文木（mdast）にする読み。
//
// 組はブラウザの `ReportMarkdown` の remark の段（`remark-gfm`・`remark-cjk-friendly`）にそろえる。
// そろえないと、ブラウザが描く形とサーバの判定が食い違う。

import type { Nodes, Root } from "mdast"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

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
