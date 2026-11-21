// `code` の塊の `marks`（強調する行）の読みと、運び方。

/** 強調する行。`lines` は `"4-8"` か `"12"`（1 始まり）。 */
export type CodeMark = { readonly lines: string; readonly label: string }

/** 行の範囲（両端を含む、1 始まり）。 */
export type LineRange = { readonly start: number; readonly end: number }

const LINES = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/

/** `"4-8"`・`"12"` を範囲に読む。読めない・始点が 1 未満・始点が終点より後は `undefined`。 */
export function readMarkLines(lines: string): LineRange | undefined {
  const match = LINES.exec(lines)
  if (match === null) {
    return undefined
  }
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  return start < 1 || start > end ? undefined : { start, end }
}

/** 印の `lines` が読めて、ソースの行数以内に収まっているか。 */
export function markFitsLines(mark: CodeMark, lineCount: number): boolean {
  const range = readMarkLines(mark.lines)
  return range !== undefined && range.end <= lineCount
}

/** ソースの行数（末尾の 1 改行は数えない）。 */
export function sourceLineCount(source: string): number {
  return source.replace(/\n$/, "").split("\n").length
}

const MARKS_TOKEN_PREFIX = "marks="

/** フェンスの info に添える 1 語（空白を含まない）。 */
export function encodeMarks(marks: readonly CodeMark[]): string {
  return `${MARKS_TOKEN_PREFIX}${marksToken(marks)}`
}

/** `decodeMarks` が読む形（`marks=` の頭を除いた部分）。 */
export function marksToken(marks: readonly CodeMark[]): string {
  return encodeURIComponent(JSON.stringify(marks))
}

/** info の meta から末尾の `marks=` の語を切り離す。`rest` は残り（前後の空白を落とす）。 */
export function splitMarksToken(meta: string): {
  readonly rest: string
  readonly marks?: string
} {
  const trimmed = meta.trim()
  const index = trimmed.search(/(?:^|\s)marks=\S*$/)
  if (index === -1) {
    return { rest: trimmed, marks: undefined }
  }
  return {
    rest: trimmed.slice(0, index).trim(),
    marks: trimmed.slice(index).trim().slice(MARKS_TOKEN_PREFIX.length),
  }
}

/** {@link encodeMarks} の語（`marks=` を除いた部分）を戻す。読めなければ空。 */
export function decodeMarks(token: string): readonly CodeMark[] {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(token))
    return Array.isArray(value)
      ? value.flatMap((item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "lines" in item &&
          "label" in item &&
          typeof item.lines === "string" &&
          typeof item.label === "string"
            ? [{ lines: item.lines, label: item.label }]
            : [],
        )
      : []
  } catch {
    // JSON として読めない印の指定は印なしとして扱う
    return []
  }
}
