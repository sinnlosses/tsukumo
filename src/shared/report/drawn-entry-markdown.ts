// 面が描くセクションの部品について、描くものがあるかと、面が Markdown の字で受ける塊の字を、塊の値から決める。

import type { ReportBlock, ReportBlockSection } from "./report-block.ts"
import { htmlInline, joinParts, markdownInline } from "./report-inline-markdown.ts"
import type { LeafGutterNote, LeafValue } from "./report-leaf-value.ts"

/**
 * 塊1つの Markdown が空（`""`）か、空白だけか、描くものがあるか。
 * 空白だけになるのは、空白だけの `markdown` の塊で欄外注の無いときだけ。
 */
type DrawnEntryPresence = "empty" | "blank" | "drawn"

/** `Markdown` の内容部品と、内容部品に由来しない塊の種類。 */
type MarkdownEntryBlock = Extract<ReportBlock, { readonly kind: "text" | "markdown" }>

export function drawnEntryPresence(block: ReportBlock, value: LeafValue): DrawnEntryPresence {
  if (value.mergedIntoPrevious) {
    return "empty"
  }
  if (value.gutterNotes.length > 0) {
    return "drawn"
  }
  switch (block.kind) {
    case "text":
    case "quote":
      return block.text.trim() === "" ? "empty" : "drawn"
    case "note":
      return block.tone === "memo" || block.text.trim() === "" ? "empty" : "drawn"
    case "list":
      return block.items.length === 0 ? "empty" : "drawn"
    case "markdown":
      return block.markdown === "" ? "empty" : block.markdown.trim() === "" ? "blank" : "drawn"
    default:
      return "drawn"
  }
}

/** 節の見出しの行。見出しの無いセクションは空文字。 */
export function sectionHeadingMarkdown(heading: string): string {
  return heading.trim() === "" ? "" : `## ${markdownInline(heading)}`
}

/** 見出しか、描くものがある塊が1つでもあるか。`values` はセクションの部品と同じ並び。 */
export function sectionDrawsAnything(
  section: ReportBlockSection,
  values: readonly LeafValue[],
): boolean {
  return (
    section.heading.trim() !== "" ||
    section.blocks.some((block, index) => {
      const value = values[index]
      return value !== undefined && drawnEntryPresence(block, value) === "drawn"
    })
  )
}

/** `Markdown` の内容部品と内容部品に由来しない塊の字。前の包みへ寄せた塊は空文字。 */
export function drawnEntryMarkdown(block: MarkdownEntryBlock, value: LeafValue): string {
  if (value.mergedIntoPrevious) {
    return ""
  }
  const body = block.kind === "markdown" ? block.markdown : markdownInline(block.text)
  return gutterGroupMarkdown(foldedMarkdown(block.fold, body), value.gutterNotes)
}

export function gutterGroupMarkdown(body: string, gutterNotes: readonly LeafGutterNote[]): string {
  if (gutterNotes.length === 0) {
    return body
  }
  return joinParts([
    '<div class="with-gutter">',
    body,
    joinParts(['<div class="gutter">', ...gutterNotes.map(gutterNoteMarkdown), "</div>"]),
    "</div>",
  ])
}

export function foldedMarkdown(fold: string, markdown: string): string {
  return fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(fold)}</summary>\n\n${markdown}\n\n</details>`
}

function gutterNoteMarkdown({ label, text }: LeafGutterNote): string {
  const labelHtml = label === "" ? "" : `<span class="gutter-note-label">${label}</span>`
  return `<aside class="gutter-note">\n\n${labelHtml}${markdownInline(text)}\n\n</aside>`
}
