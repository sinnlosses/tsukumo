// `code` の塊の `marks`（強調する行）の読みと、運び方と、畳む範囲。

/** 強調する行。`lines` は `"4-8"` か `"12"`（1 始まり）。 */
export type CodeMark = { readonly lines: string; readonly label: string }

/** 行の範囲（両端を含む、1 始まり）。 */
export type LineRange = { readonly start: number; readonly end: number }

/** 印の行から、畳まずに残す行数。 */
const CODE_MARK_CONTEXT_LINES = 3

/** 離れた行の連続がこの数を超えたら畳む。 */
const CODE_FOLD_MIN_LINES = 20

const LINES = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/

/** `"4-8"`・`"12"` を範囲に読む。読めない・始点が 1 未満・始点が終点より後は `undefined`。 */
export function readMarkLines(lines: string): LineRange | undefined {
  const match = LINES.exec(lines)
  const start = Number(match?.[1])
  const end = match?.[2] === undefined ? start : Number(match[2])
  return match === null || start < 1 || start > end ? undefined : { start, end }
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
  readonly marks: string | undefined
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
    return []
  }
}

/**
 * 畳む範囲。印の行から {@link CODE_MARK_CONTEXT_LINES} 行より離れた行の連続が
 * {@link CODE_FOLD_MIN_LINES} 行を超えるものだけ。印が読めるものが無ければ空。
 */
export function foldedRanges(lineCount: number, marks: readonly CodeMark[]): readonly LineRange[] {
  const ranges = marks.flatMap((mark) => readMarkLines(mark.lines) ?? [])
  if (ranges.length === 0) {
    return []
  }
  const far = Array.from({ length: lineCount }, (_, index) => index + 1).map(
    (line) =>
      !ranges.some(
        (range) =>
          line >= range.start - CODE_MARK_CONTEXT_LINES &&
          line <= range.end + CODE_MARK_CONTEXT_LINES,
      ),
  )
  const runs: LineRange[] = []
  far.forEach((isFar, index) => {
    const line = index + 1
    const last = runs.at(-1)
    if (!isFar) {
      return
    }
    if (last !== undefined && last.end === line - 1) {
      runs[runs.length - 1] = { start: last.start, end: line }
    } else {
      runs.push({ start: line, end: line })
    }
  })
  return runs.filter((run) => run.end - run.start + 1 > CODE_FOLD_MIN_LINES)
}
