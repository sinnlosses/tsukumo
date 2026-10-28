// 文中の数の数え方。記録（結論に効く数）と雛形の検査が同じ結論に同じ数を出すよう、1 か所に置く。

import { markdownTreeOf, nodesInOrder } from "./markdown-tree.ts"

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g

/** 文中の数（数字の連なり）の数。インラインコードの中は数えない。 */
export function numberCountOutsideCode(markdown: string): number {
  return nodesInOrder(markdownTreeOf(markdown)).reduce(
    (total, node) =>
      total + (node.type === "text" ? (node.value.match(NUMBER_PATTERN)?.length ?? 0) : 0),
    0,
  )
}
