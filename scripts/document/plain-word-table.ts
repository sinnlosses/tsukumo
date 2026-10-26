// 用語集の「わかりにくい語」の表を、`PLAIN_WORDS` から組み立てる純粋関数。
// 表の範囲は、開始と終了の印のコメントに挟まれた行。

import type { PlainWord } from "../../src/shared/report/plain-word.ts"

export const PLAIN_WORD_TABLE_START = "<!-- plain-word-table:start -->"
export const PLAIN_WORD_TABLE_END = "<!-- plain-word-table:end -->"

const COLUMNS = ["わかりにくい語", "言い換え先", "意味"] as const

/** 表の行（見出しの行と区切りの行を含まない）のセル。 */
export function plainWordRows(words: readonly PlainWord[]): readonly (readonly string[])[] {
  return words.map(({ spelling, replacement, meaning }) => [spelling, replacement, meaning])
}

/** 文書の印に挟まれた範囲を、`words` から組んだ表に書き直す。印が無ければ変えない。 */
export function rewritePlainWordTable(text: string, words: readonly PlainWord[]): string {
  const start = text.indexOf(PLAIN_WORD_TABLE_START)
  const end = text.indexOf(PLAIN_WORD_TABLE_END)
  if (start < 0 || end < start) {
    return text
  }
  const table = [
    `| ${COLUMNS.join(" | ")} |`,
    `| ${COLUMNS.map(() => "---").join(" | ")} |`,
    ...plainWordRows(words).map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n")
  return `${text.slice(0, start + PLAIN_WORD_TABLE_START.length)}\n\n${table}\n\n${text.slice(end)}`
}

/** 文書の印に挟まれた表の、いま書かれている行のセル。印が無ければ空。 */
export function readPlainWordRows(text: string): readonly (readonly string[])[] {
  const start = text.indexOf(PLAIN_WORD_TABLE_START)
  const end = text.indexOf(PLAIN_WORD_TABLE_END)
  if (start < 0 || end < start) {
    return []
  }
  return text
    .slice(start + PLAIN_WORD_TABLE_START.length, end)
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, line.lastIndexOf("|"))
        .split("|")
        .map((cell) => cell.trim()),
    )
}
