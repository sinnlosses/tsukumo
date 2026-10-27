// レポートの本文から、言い換え表（`PLAIN_WORDS`）の語を見つける。

import type { Nodes } from "mdast"

import type { ReportBlock } from "../../../shared/report/report-block.ts"
import { leafBlocksOf } from "../../../shared/report/row-panel-block.ts"
import { markdownTreeOf } from "./markdown-tree.ts"
import { PLAIN_WORDS } from "./plain-word.ts"
import { proseTexts } from "./report-prose-rule.ts"
import type { ReportDraft } from "./report-violation.ts"

/**
 * 本文の地の文に出てくる表の綴りを、表の順に返す。同じ箇所は長い綴りにだけ数える。
 * 引用・コード・HTML の中は見ない。
 */
export function plainWordSpellingsIn(report: ReportDraft): readonly string[] {
  const proseOfBlocks = report.sections.flatMap((section) => [
    section.heading,
    ...section.blocks.flatMap((block) => (block.kind === "panel" ? [block.title] : [])),
    ...leafBlocksOf(section.blocks).flatMap((block) => [
      ...proseTexts(block),
      ...ownProseTexts(block),
    ]),
  ])
  const prose = [report.conclusion, report.favor, ...proseOfBlocks].flatMap(proseSegmentsOf)
  const remaining = PLAIN_WORDS.reduce(
    (state, word) => ({
      segments: state.segments.flatMap((segment) => segment.split(word.spelling)),
      spellings: state.segments.some((segment) => segment.includes(word.spelling))
        ? [...state.spellings, word.spelling]
        : state.spellings,
    }),
    { segments: prose, spellings: [] as readonly string[] },
  )
  return remaining.spellings
}

/** `proseTexts` が数えない、利用者が読む地の文（`note`・`markdown`・`list` の項目の本文と題）。 */
function ownProseTexts(block: ReportBlock): readonly string[] {
  switch (block.kind) {
    case "note":
      return [block.text]
    case "markdown":
      return [block.markdown]
    case "list":
      return block.items.flatMap((item) => [item.label, item.text, item.branch])
    default:
      return []
  }
}

/** 地の文の字だけの断片。引用・コード・HTML は飛ばす。 */
function proseSegmentsOf(markdown: string): readonly string[] {
  return segmentsIn(markdownTreeOf(markdown))
}

function segmentsIn(node: Nodes): readonly string[] {
  switch (node.type) {
    case "text":
      return [node.value]
    case "inlineCode":
    case "code":
    case "html":
    case "blockquote":
      return []
    default:
      return "children" in node ? node.children.flatMap(segmentsIn) : []
  }
}
