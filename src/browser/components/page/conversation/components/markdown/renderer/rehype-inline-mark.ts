// 文中の行内の印（`{{12 → 8}}`・`{{spark: 3 5 4 8}}`・`{{3 / 5}}`）を、サニタイズのあとの木で `span` に替える rehype のプラグイン。
// 印の `span` の文字は `foldInlineMarks` が畳んだ素の文字と同じにする（装飾の要素は文字を持たない）。
// 壊れた印と inline code（`code`・`pre`）の中は元の文字のまま残す。

import type { Element, ElementContent, Root, RootContent } from "hast"

import {
  foldInlineMarks,
  parseInlineMarks,
} from "../../../../../../../shared/report/inline-mark.ts"
import styles from "./report-notation.module.css"

type MarkSegment = Extract<ReturnType<typeof parseInlineMarks>[number], { readonly kind: "mark" }>

const MARK_CLASS_NAMES = {
  "report-mark-diff": styles["report-mark-diff"],
  "report-mark-diff-from": styles["report-mark-diff-from"],
  "report-mark-spark": styles["report-mark-spark"],
  "report-mark-ratio": styles["report-mark-ratio"],
  "report-mark-ratio-bar": styles["report-mark-ratio-bar"],
  "report-mark-ratio-fill": styles["report-mark-ratio-fill"],
  "report-mark-ratio-value": styles["report-mark-ratio-value"],
} as const

const SKIPPED_TAG_NAMES: ReadonlySet<string> = new Set(["code", "pre"])

export function rehypeInlineMark(): (tree: Root) => Root {
  return (tree) => ({
    ...tree,
    children: tree.children.flatMap((child): RootContent[] =>
      child.type === "doctype" ? [child] : rewriteContent(child),
    ),
  })
}

function rewriteContent(node: ElementContent): ElementContent[] {
  if (node.type === "text") {
    return markNodes(node.value)
  }
  if (node.type !== "element" || SKIPPED_TAG_NAMES.has(node.tagName)) {
    return [node]
  }
  return [{ ...node, children: node.children.flatMap(rewriteContent) }]
}

function markNodes(value: string): ElementContent[] {
  if (!value.includes("{{")) {
    return [{ type: "text", value }]
  }
  return parseInlineMarks(value).map((segment): ElementContent =>
    segment.kind === "mark" ? markElement(segment) : { type: "text", value: segment.text },
  )
}

function markElement(segment: MarkSegment): Element {
  const { mark } = segment
  switch (mark.kind) {
    case "diff":
      return span("report-mark-diff", [
        span("report-mark-diff-from", [{ type: "text", value: `${mark.from} →` }]),
        { type: "text", value: ` ${mark.to}` },
      ])
    case "spark":
      return span("report-mark-spark", [{ type: "text", value: foldInlineMarks(segment.source) }])
    case "ratio":
      return span("report-mark-ratio", [
        span("report-mark-ratio-bar", [
          span("report-mark-ratio-fill", [], `width: ${String(ratioPercent(mark))}%`),
        ]),
        span("report-mark-ratio-value", [{ type: "text", value: `${mark.part}/${mark.whole}` }]),
      ])
  }
}

function ratioPercent(mark: { readonly part: string; readonly whole: string }): number {
  return Math.round((Number(mark.part) / Number(mark.whole)) * 100)
}

function span(
  name: keyof typeof MARK_CLASS_NAMES,
  children: ElementContent[],
  style: string | undefined = undefined,
): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: [MARK_CLASS_NAMES[name]],
      ...(style === undefined ? {} : { style }),
    },
    children,
  }
}
