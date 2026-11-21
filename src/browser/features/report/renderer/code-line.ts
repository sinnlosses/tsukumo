// highlight.js が色付けした `code` の子（hast）を、行ごとの並びに分ける。
// 色の `<span>` が改行をまたぐときは、行ごとに同じ class の `<span>` を開き直す。

import type { Element, ElementContent } from "hast"

export type CodeLine = readonly ElementContent[]

/** 末尾の 1 つの改行（CommonMark がフェンスの終わりに添えるもの）が作る空の最終行は含めない。 */
export function splitCodeLines(children: readonly ElementContent[]): readonly CodeLine[] {
  const lines = splitNodes(children)
  return lines.at(-1)?.length === 0 ? lines.slice(0, -1) : lines
}

function splitNodes(nodes: readonly ElementContent[]): readonly CodeLine[] {
  return nodes.reduce<readonly CodeLine[]>(
    (lines, node) => {
      const [first = [], ...rest] = splitNode(node)
      return [...lines.slice(0, -1), [...(lines.at(-1) ?? []), ...first], ...rest]
    },
    [[]],
  )
}

function splitNode(node: ElementContent): readonly CodeLine[] {
  if (node.type === "text") {
    return node.value.split("\n").map((piece) => (piece === "" ? [] : [{ ...node, value: piece }]))
  }
  if (node.type !== "element") {
    return [[node]]
  }
  return splitNodes(node.children).map((line) =>
    line.length === 0 ? [] : [{ ...node, children: [...line] } satisfies Element],
  )
}
