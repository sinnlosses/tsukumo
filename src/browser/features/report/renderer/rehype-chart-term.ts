// 地の文の中で、同じ節の図の項目名と同じ字の語を、印の `span` で包む rehype のプラグイン（サニタイズのあと）。
// `code`・`pre`・`a` の中は元の字のまま残す。

import type { Element, ElementContent, Root, RootContent } from "hast"

import { chartTermSpans, type ChartTermLinks } from "../domain/chart-term-link.ts"

const SKIPPED_TAG_NAMES: ReadonlySet<string> = new Set(["code", "pre", "a"])

export type RehypeChartTermOptions = {
  readonly terms: ChartTermLinks
}

export function rehypeChartTerm(options: RehypeChartTermOptions): (tree: Root) => Root {
  return (tree) => ({
    ...tree,
    children: tree.children.flatMap((child): RootContent[] =>
      child.type === "doctype" ? [child] : rewriteContent(child, options.terms),
    ),
  })
}

function rewriteContent(node: ElementContent, terms: ChartTermLinks): ElementContent[] {
  if (node.type === "text") {
    return termNodes(node.value, terms)
  }
  if (node.type !== "element" || SKIPPED_TAG_NAMES.has(node.tagName)) {
    return [node]
  }
  return [{ ...node, children: node.children.flatMap((child) => rewriteContent(child, terms)) }]
}

function termNodes(value: string, terms: ChartTermLinks): ElementContent[] {
  const nodes: ElementContent[] = []
  let cursor = 0
  for (const span of chartTermSpans(value, terms)) {
    const target = terms.get(span.term)
    if (target === undefined) {
      continue
    }
    if (span.start > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, span.start) })
    }
    nodes.push(termElement(value.slice(span.start, span.end), span.term, target))
    cursor = span.end
  }
  if (cursor === 0) {
    return [{ type: "text", value }]
  }
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) })
  }
  return nodes
}

function termElement(
  text: string,
  term: string,
  target: { readonly chartId: string; readonly index: number },
): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {
      dataChartTerm: term,
      dataChartId: target.chartId,
      dataChartIndex: String(target.index),
      tabIndex: 0,
    },
    children: [{ type: "text", value: text }],
  }
}
