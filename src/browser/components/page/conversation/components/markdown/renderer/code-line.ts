// highlight.js が色付けした `code` の子（hast）を、行ごとの並びに分ける。
// 色の `<span>` が改行をまたぐときは、行ごとに同じ class の `<span>` を開き直す。

import type { Element, ElementContent } from "hast"

export type CodeLine = readonly ElementContent[]

/** 末尾の 1 つの改行（CommonMark がフェンスの終わりに添えるもの）が作る空の最終行は含めない。 */
export function splitCodeLines(children: readonly ElementContent[]): readonly CodeLine[] {
  const lines = splitNodes(children)
  return lines.at(-1)?.length === 0 ? lines.slice(0, -1) : lines
}

export type DiffSide = "added" | "removed"

/** `diff` の行の種別。行の字をテーマが `hljs-addition` / `hljs-deletion` で包むので、先頭の要素の class で読む。 */
export function diffLineSide(line: CodeLine): DiffSide | undefined {
  const first = line[0]
  if (first?.type !== "element") {
    return undefined
  }
  const names = first.properties.className
  if (!Array.isArray(names)) {
    return undefined
  }
  if (names.includes("hljs-addition")) {
    return "added"
  }
  return names.includes("hljs-deletion") ? "removed" : undefined
}

/** 行の先頭の1字（`+` / `-`）を `className` の `<span>` で包む。字は動かさない。 */
export function markDiffSign(line: CodeLine, className: string): CodeLine {
  const [first, ...rest] = line
  return first === undefined ? line : [...signNode(first, className), ...rest]
}

function signNode(node: ElementContent, className: string): readonly ElementContent[] {
  if (node.type === "text") {
    return node.value === ""
      ? [node]
      : [
          {
            type: "element",
            tagName: "span",
            properties: { className: [className] },
            children: [{ type: "text", value: node.value.slice(0, 1) }],
          },
          ...(node.value.length > 1 ? [{ ...node, value: node.value.slice(1) }] : []),
        ]
  }
  if (node.type !== "element") {
    return [node]
  }
  const [child, ...rest] = node.children
  return child === undefined
    ? [node]
    : [{ ...node, children: [...signNode(child, className), ...rest] } satisfies Element]
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
