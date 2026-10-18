// レポートの検査のうち、地の文・見出し・項目の書き方を判定する述語。

import type { ReportBlock } from "../../../shared/report/report-block.ts"
import { MAX_HEADING, MAX_ITEM_LABEL } from "../../../shared/report/report-limit.ts"
import { sentenceCount } from "../../../shared/report/sentence-count.ts"
import { paragraphs, splitFences } from "./report-markdown-notation.ts"

/** 地の文の段落の文の上限（条「地の文の段落は3文まで」）。 */
const MAX_PARAGRAPH_SENTENCES = 3

export function isLongProse(text: string): boolean {
  return sentenceCount(text) > MAX_PARAGRAPH_SENTENCES
}

/** 逃げ道の外側の段落のうち、文の上限を超えるものの数。 */
export function longMarkdownParagraphCount(blocks: readonly ReportBlock[]): number {
  return blocks
    .flatMap((block) =>
      block.kind === "markdown" ? paragraphs(splitFences(block.markdown).outside) : [],
    )
    .filter(isLongProse).length
}

/** 英語の地の文とみなす語の数の下限。 */
const MIN_ENGLISH_WORDS = 3

const KANA_OR_KANJI = /[぀-ヿ㐀-䶿一-鿿]/

/**
 * 仮名も漢字も無く、英語の語が {@link MIN_ENGLISH_WORDS} 以上ある文字か。
 * インラインコード・リンク・URL・パスらしい語（`/` `.` `_` を含む）は数えない。
 */
export function isNonJapanese(text: string): boolean {
  const words = text
    .replace(/`[^`\n]*`/g, " ")
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
  return withoutInlineCode(text).includes(ARROW)
}

export function proseTexts(block: ReportBlock): readonly string[] {
  switch (block.kind) {
    case "text":
      return [block.text]
    case "table":
      return block.rows
        .flat()
        .map((cell) => (typeof cell === "string" ? cell : "text" in cell ? cell.text : ""))
    default:
      return []
  }
}

export function labelInItemCount(block: ReportBlock): number {
  return block.kind === "list" && block.style !== "flow"
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

function withoutInlineCode(text: string): string {
  return text.replace(/`[^`\n]*`/g, "")
}
