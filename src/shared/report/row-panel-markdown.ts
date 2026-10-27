// `row`・`panel` の容れ物の HTML を組む。子の Markdown は呼ぶ側が葉の塊と同じ手で描いて渡す。

import type { SectionBlock } from "./report-block.ts"
import { joinParts, markdownInline } from "./report-inline-markdown.ts"

/** 容れ物に付ける印の名前。見た目は `report-notation.module.css` の `report-<名前>`。 */
export const ROW_PANEL_MARK_NAMES = [
  "block-row",
  "block-row-cell",
  "block-panel",
  "block-panel-title",
] as const satisfies readonly string[]

type ArrangedBlock = Extract<SectionBlock, { readonly kind: "row" | "panel" }>

/**
 * `row` は子ごとの区画を横に並べる容れ物、`panel` は題の行と子の並びを囲む枠にする。
 * 空の子は置かず、子が1つも残らなければ空文字。中身は空行で挟み、Markdown として効かせる。
 */
export function arrangedBlockMarkdown(block: ArrangedBlock, children: readonly string[]): string {
  const filled = children.filter((child) => child.trim() !== "")
  if (filled.length === 0) {
    return ""
  }
  if (block.kind === "row") {
    return joinParts(['<div class="block-row">', ...filled.map(rowCellMarkdown), "</div>"])
  }
  return joinParts([
    '<div class="block-panel">',
    block.title.trim() === ""
      ? ""
      : `<div class="block-panel-title">\n\n${markdownInline(block.title)}\n\n</div>`,
    ...filled,
    "</div>",
  ])
}

function rowCellMarkdown(child: string): string {
  return joinParts(['<div class="block-row-cell">', child, "</div>"])
}
