// レポートの本文から、言い換え表（`PLAIN_WORDS`）の語を見つける。

import type { Nodes } from "mdast"

import type { ReportOutline, ReportOutlineLeaf } from "../../../shared/report/report-outline.ts"
import { markdownTreeOf } from "./markdown-tree.ts"
import { PLAIN_WORDS } from "./plain-word.ts"
import { proseTexts } from "./report-prose-rule.ts"
import type { ReportDraft } from "./report-violation.ts"

/**
 * 本文の地の文に出てくる表の綴りを、表の順に返す。同じ箇所は長い綴りにだけ数える。
 * 引用・コード・HTML の中は見ない。
 */
export function plainWordSpellingsIn(
  report: Pick<ReportDraft, "conclusion" | "favor">,
  outline: ReportOutline,
): readonly string[] {
  const proseOfBlocks = outline.sections.flatMap((section) => [
    ...(section.kind === "section" ? [section.heading] : []),
    ...section.leaves.flatMap((leaf) => [...proseTexts(leaf), ...ownProseTexts(leaf)]),
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
function ownProseTexts(leaf: ReportOutlineLeaf): readonly string[] {
  switch (leaf.component) {
    case "Note":
      return [leaf.text]
    case "Markdown":
      return [leaf.markdown]
    case "ItemList":
      return leaf.items.flatMap((item) => [item.label, item.text, item.branch])
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
