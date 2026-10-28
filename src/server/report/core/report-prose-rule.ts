// レポートの検査のうち、地の文・見出し・項目の書き方を判定する述語。

import { textOutsideInlineMarks } from "../../../shared/report/inline-mark.ts"
import { tableRowCells } from "../../../shared/report/report-block-comparison.ts"
import type { ReportBlock } from "../../../shared/report/report-block.ts"
import { MAX_HEADING, MAX_ITEM_LABEL } from "../../../shared/report/report-limit.ts"
import type { ReportOutlineLeaf } from "../../../shared/report/report-outline.ts"
import { withoutInlineCode } from "./markdown-tree.ts"

/** 英語の地の文とみなす語の数の下限。 */
const MIN_ENGLISH_WORDS = 3

const KANA_OR_KANJI = /[぀-ヿ㐀-䶿一-鿿]/

/**
 * 仮名も漢字も無く、英語の語が {@link MIN_ENGLISH_WORDS} 以上ある文字か。
 * インラインコード・リンク・URL・パスらしい語（`/` `.` `_` を含む）は数えない。
 */
export function isNonJapanese(text: string): boolean {
  const words = withoutInlineCode(text, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[.,;:!?]+$/, ""))
  return (
    !KANA_OR_KANJI.test(words.join(" ")) &&
    words.filter((word) => /^[A-Za-z]{2,}$/.test(word)).length >= MIN_ENGLISH_WORDS
  )
}

const ARROW = " → "

/** 項目の頭の `名前:`。URL の `://` と時刻の `12:30`、句点を含む頭は名前でない。 */
const ITEM_LABEL = new RegExp(`^[^\`:：。\\n]{1,${String(MAX_ITEM_LABEL)}}[:：](?!//)(?!\\d)`)

export function hasArrow(text: string): boolean {
  return withoutInlineCode(textOutsideInlineMarks(text), "").includes(ARROW)
}

export function proseTexts(leaf: ReportOutlineLeaf): readonly string[] {
  switch (leaf.component) {
    case "Paragraph":
      return [leaf.text]
    case "Table":
      return leaf.rows
        .flatMap(tableRowCells)
        .map((cell) =>
          typeof cell === "string"
            ? cell
            : "text" in cell
              ? cell.text
              : "tag" in cell
                ? cell.tag
                : "",
        )
    default:
      return []
  }
}

export function labelInItemCount(block: ReportBlock): number {
  return block.kind === "list" && block.style !== "flow" && block.style !== "cards"
    ? block.items.filter((item) => item.label.trim() === "" && ITEM_LABEL.test(item.text.trim()))
        .length
    : 0
}

const MIN_FLOW_STAGES = 3

export function isLabeledOrdered(block: ReportBlock): boolean {
  return (
    block.kind === "list" &&
    block.style === "ordered" &&
    block.items.length >= MIN_FLOW_STAGES &&
    block.items.every((item) => item.label.trim() !== "")
  )
}

export function isBadHeading(heading: string): boolean {
  const trimmed = heading.trim()
  return [...trimmed].length > MAX_HEADING || /[?？]$/.test(trimmed)
}
