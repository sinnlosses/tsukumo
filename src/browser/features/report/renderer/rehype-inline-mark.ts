// 文中の行内の印（`{{12 → 8}}`・`{{spark: 3 5 4 8}}`・`{{3 / 5}}`・`{{cite: s1}}`・`{{map: <ID>}}`）を、サニタイズのあとの木で `span` に替える rehype のプラグイン。
// 前後の差・折れ線・帯の `span` の文字は `foldInlineMarks` が畳んだ素の文字と同じにする（装飾の要素は文字を持たない）。
// 出典の印だけは畳むと空で、描くときは番号と札の題・ホスト名を字に持つ。番号の表を渡さない（レポートの外の）ときは何も描かない。
// 壊れた印と inline code（`code`・`pre`）の中は元の文字のまま残す。

import type { Element, ElementContent, Properties, Root, RootContent } from "hast"

import { foldInlineMarks, parseInlineMarks } from "../../../../shared/report/inline-mark.ts"
import type { CitationTable } from "../domain/citation-number.ts"
import { reportExportMark } from "../report-export-copy.ts"
import styles from "./report-notation.module.css"

type MarkSegment = Extract<ReturnType<typeof parseInlineMarks>[number], { readonly kind: "mark" }>

type InlineMarkOptions = {
  /** レポートの出典の番号の表。無ければ出典の印は何も描かない。 */
  readonly citations?: CitationTable
}

const MARK_CLASS_NAMES = {
  "report-mark-diff": styles["report-mark-diff"],
  "report-mark-diff-from": styles["report-mark-diff-from"],
  "report-mark-spark": styles["report-mark-spark"],
  "report-mark-ratio": styles["report-mark-ratio"],
  "report-mark-ratio-bar": styles["report-mark-ratio-bar"],
  "report-mark-ratio-fill": styles["report-mark-ratio-fill"],
  "report-mark-ratio-value": styles["report-mark-ratio-value"],
  "report-mark-map": styles["report-mark-map"],
  "report-mark-cite-group": styles["report-mark-cite-group"],
  "report-mark-cite": styles["report-mark-cite"],
  "report-mark-cite-badge": styles["report-mark-cite-badge"],
  "report-mark-cite-pending": styles["report-mark-cite-pending"],
  "report-mark-cite-card": styles["report-mark-cite-card"],
  "report-mark-cite-title": styles["report-mark-cite-title"],
  "report-mark-cite-host": styles["report-mark-cite-host"],
} as const

const SKIPPED_TAG_NAMES: ReadonlySet<string> = new Set(["code", "pre"])

const MARK_CLASS_NAME_SET: ReadonlySet<string> = new Set(Object.values(MARK_CLASS_NAMES))

/** この段が作った印の要素か。 */
export function isInlineMarkElement(node: Element): boolean {
  const { className } = node.properties
  return Array.isArray(className) && className.some((name) => MARK_CLASS_NAME_SET.has(String(name)))
}

export function rehypeInlineMark(options: InlineMarkOptions = {}): (tree: Root) => Root {
  const rewriteContent = (node: ElementContent): ElementContent[] => {
    if (node.type === "text") {
      return markNodes(node.value, options)
    }
    if (node.type !== "element" || SKIPPED_TAG_NAMES.has(node.tagName)) {
      return [node]
    }
    return [{ ...node, children: node.children.flatMap(rewriteContent) }]
  }
  return (tree) => ({
    ...tree,
    children: tree.children.flatMap((child): RootContent[] =>
      child.type === "doctype" ? [child] : rewriteContent(child),
    ),
  })
}

function markNodes(value: string, options: InlineMarkOptions): ElementContent[] {
  if (!value.includes("{{")) {
    return [{ type: "text", value }]
  }
  return parseInlineMarks(value).map((segment): ElementContent =>
    segment.kind === "mark" ? markElement(segment, options) : { type: "text", value: segment.text },
  )
}

function markElement(segment: MarkSegment, options: InlineMarkOptions): ElementContent {
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
          span("report-mark-ratio-fill", [], { style: `width: ${String(ratioPercent(mark))}%` }),
        ]),
        span("report-mark-ratio-value", [{ type: "text", value: `${mark.part}/${mark.whole}` }]),
      ])
    case "map":
      return span("report-mark-map", [{ type: "text", value: segment.source }], {
        dataMapBox: mark.id,
      })
    case "cite": {
      const { citations } = options
      return citations === undefined
        ? { type: "text", value: "" }
        : span(
            "report-mark-cite-group",
            mark.ids.map((id) => citeElement(id, citations)),
          )
    }
  }
}

/** 番号のバッジ（末尾の一覧の行へ飛ぶ）と、触れるか焦点で出る題とホスト名の札。表に無い id は控えめな「…」。 */
function citeElement(id: string, citations: CitationTable): Element {
  const entry = citations.get(id)
  if (entry === undefined) {
    return span("report-mark-cite", [
      span("report-mark-cite-pending", [{ type: "text", value: "…" }]),
    ])
  }
  return span("report-mark-cite", [
    element("a", "report-mark-cite-badge", [{ type: "text", value: String(entry.number) }], {
      href: `#${entry.rowId}`,
      ariaDescribedBy: [entry.rowId],
    }),
    span(
      "report-mark-cite-card",
      [
        span("report-mark-cite-title", [{ type: "text", value: entry.title }]),
        span("report-mark-cite-host", [{ type: "text", value: entry.host }]),
      ],
      { role: "tooltip", ...reportExportMark.drop },
    ),
  ])
}

function ratioPercent(mark: { readonly part: string; readonly whole: string }): number {
  return Math.round((Number(mark.part) / Number(mark.whole)) * 100)
}

function span(
  name: keyof typeof MARK_CLASS_NAMES,
  children: ElementContent[],
  properties: Properties = {},
): Element {
  return element("span", name, children, properties)
}

function element(
  tagName: string,
  name: keyof typeof MARK_CLASS_NAMES,
  children: ElementContent[],
  properties: Properties,
): Element {
  return {
    type: "element",
    tagName,
    properties: { className: [MARK_CLASS_NAMES[name]], ...properties },
    children,
  }
}
