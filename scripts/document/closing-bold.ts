// CommonMark の構文木で、太字にならずに文字のまま残った `**` の行を拾う純粋関数。
// コードのフェンス・inline code の中の `**` と、`\*\*` と書いたエスケープは拾わない。
// remark-cjk-friendly は付けず、GitHub 相当の読み方で判定する。

import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

const UNESCAPED_BOLD_MARK = /(?<!\\)\*\*/gu

/** 太字が閉じない行1つ。 */
export type UnclosedBold = {
  /** 行（1始まり）。 */
  readonly line: number
  /** 行の本文。 */
  readonly text: string
}

const processor = unified().use(remarkParse).use(remarkGfm)

/** 本文から、太字が閉じない行をすべて拾う。 */
export function findUnclosedBold(text: string): UnclosedBold[] {
  const lines = text.split("\n")
  const badLines = new Set<number>()
  visit(processor.parse(text), "text", (node) => {
    const { start, end } = node.position ?? {}
    if (start?.offset === undefined || end?.offset === undefined) return
    const raw = text.slice(start.offset, end.offset)
    for (const match of raw.matchAll(UNESCAPED_BOLD_MARK)) {
      badLines.add(start.line + raw.slice(0, match.index).split("\n").length - 1)
    }
  })
  return [...badLines]
    .toSorted((a, b) => a - b)
    .map((line) => ({ line, text: lines[line - 1] ?? "" }))
}

/** 太字が閉じない行1つを、一覧に出す1行にする。 */
export function formatUnclosedBold(path: string, found: UnclosedBold): string {
  return `${path}:${found.line}: ${found.text.trim()}`
}
