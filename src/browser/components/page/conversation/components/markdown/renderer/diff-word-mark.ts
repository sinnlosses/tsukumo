// `diff` の1行（hast の並び）の中の、違う語の区間を `<span>` で包む。

import type { Element, ElementContent } from "hast"

import type { CodeLine } from "./code-line.ts"
import type { TextRange } from "./word-diff.ts"

/**
 * `ranges` は行の文字の添字（先頭の `+`/`-` を含む）。区間に掛かる text を割り、区間の部分を `className` の `<span>` にする。
 * 入れ子の要素（`hljs-addition` など）の中の text にも掛かり、要素の外へは出さない。
 */
export function markDiffWords(
  line: CodeLine,
  ranges: readonly TextRange[],
  className: string,
): CodeLine {
  return ranges.length === 0 ? line : markNodes(line, 0, ranges, className)
}

function markNodes(
  nodes: readonly ElementContent[],
  offset: number,
  ranges: readonly TextRange[],
  className: string,
): readonly ElementContent[] {
  return nodes.reduce<{ readonly done: readonly ElementContent[]; readonly at: number }>(
    (state, node) => ({
      done: [...state.done, ...markNode(node, state.at, ranges, className)],
      at: state.at + textLength(node),
    }),
    { done: [], at: offset },
  ).done
}

function markNode(
  node: ElementContent,
  offset: number,
  ranges: readonly TextRange[],
  className: string,
): readonly ElementContent[] {
  if (node.type === "text") {
    return splitText(node.value, offset, ranges, className)
  }
  if (node.type !== "element") {
    return [node]
  }
  return [{ ...node, children: [...markNodes(node.children, offset, ranges, className)] }]
}

function splitText(
  value: string,
  offset: number,
  ranges: readonly TextRange[],
  className: string,
): readonly ElementContent[] {
  const local = ranges
    .map((range) => ({
      start: Math.max(range.start - offset, 0),
      end: Math.min(range.end - offset, value.length),
    }))
    .filter((range) => range.start < range.end)
  const pieces = local.flatMap((range, index) => {
    const from = local[index - 1]?.end ?? 0
    return [
      textNode(value.slice(from, range.start)),
      wordSpan(value.slice(range.start, range.end), className),
    ]
  })
  return [...pieces, textNode(value.slice(local.at(-1)?.end ?? 0))].filter(
    (node) => node.type !== "text" || node.value !== "",
  )
}

function textNode(value: string): ElementContent {
  return { type: "text", value }
}

function wordSpan(value: string, className: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [className] },
    children: [textNode(value)],
  }
}

function textLength(node: ElementContent): number {
  if (node.type === "text") {
    return node.value.length
  }
  return node.type === "element"
    ? node.children.reduce((sum, child) => sum + textLength(child), 0)
    : 0
}
