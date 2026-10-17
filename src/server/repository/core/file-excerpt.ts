// ファイルの字から、指した行の前後を切り出す（`FileExcerpt`）。ファイルは読まない。

import {
  type FileExcerpt,
  type FileExcerptRequest,
  MAX_EXCERPT_LINE_LENGTH,
  MAX_EXCERPT_LINES,
} from "../../../shared/repository/file-excerpt.ts"

/** 1行を指したときに添える前後の行数。 */
const CONTEXT_LINES_AROUND_LINE = 3

/** 範囲を指したときに添える前後の行数。 */
const CONTEXT_LINES_AROUND_RANGE = 1

/**
 * 1行を指したら前後3行、範囲を指したら範囲の前後1行を切り出す（どちらも {@link MAX_EXCERPT_LINES} 行まで）。
 * ファイルの末尾を超えた分は切り詰め、指した行の頭が末尾を超えていたら `out-of-range`。
 */
export function excerptLines(
  text: string,
  range: Pick<FileExcerptRequest, "startLine" | "endLine">,
): FileExcerpt {
  const lines = splitLines(text)
  if (range.startLine > lines.length) {
    return { kind: "out-of-range", lineCount: lines.length }
  }
  const context =
    range.startLine === range.endLine ? CONTEXT_LINES_AROUND_LINE : CONTEXT_LINES_AROUND_RANGE
  const first = Math.max(1, range.startLine - context)
  const last = Math.min(lines.length, range.endLine + context, first + MAX_EXCERPT_LINES - 1)
  return {
    kind: "lines",
    lines: lines.slice(first - 1, last).map((line, index) => ({
      number: first + index,
      ...truncateLine(line),
    })),
  }
}

/** 改行（`\n` と `\r\n`）で割る。末尾の改行の後ろは行に数えない。 */
function splitLines(text: string): readonly string[] {
  if (text === "") {
    return []
  }
  const lines = text.split(/\r?\n/)
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines
}

function truncateLine(line: string): { readonly text: string; readonly truncated: boolean } {
  // コードポイントは UTF-16 で2単位までなので、上限の2倍の単位を切れば上限のコードポイントは割らずに残る。
  const head = Array.from(line.slice(0, MAX_EXCERPT_LINE_LENGTH * 2))
  return {
    text: head.slice(0, MAX_EXCERPT_LINE_LENGTH).join(""),
    truncated: head.length > MAX_EXCERPT_LINE_LENGTH || line.length > MAX_EXCERPT_LINE_LENGTH * 2,
  }
}
