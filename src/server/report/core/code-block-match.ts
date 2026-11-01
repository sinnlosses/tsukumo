// `code` の塊の `source` が、ファイルの中身の連続した一部と一致するかの判定。

/** 省略の印にする行（`...` 単体、または行頭のコメント記号に続けた `...`）。 */
const OMISSION_LINE = /^(?:\/\/|#|--|;|%|\/\*)?\s*\.\.\.\s*(?:\*\/)?$/

/** 照合から外す `diff` の見出しの行。 */
const DIFF_HEADER_LINE = /^(?:@@|diff --git|index |\+\+\+|---)/

/**
 * `path` を持つ `code` の塊が、そのファイルの中身と一致するか。
 */
export function codeBlockMatchesFile(
  block: { readonly language: string; readonly source: string },
  fileContent: string,
): boolean {
  const contentLines =
    block.language === "diff" ? diffContentLines(block.source) : block.source.split("\n")
  const fileLines = fileContent.split("\n").map(rstrip)
  const segments = segmentsOf(contentLines.map(rstrip))
  return matchesSegments(fileLines, segments)
}

/**
 * 塊の頭の行が、ファイルの何行目に当たるか（1 始まり）。
 * 決められるのは、`diff` でなく、省略の行を含まず、ファイルの行にちょうど1か所だけ連続して現れるとき。
 * 塊の頭の空行は照合から外すが、返すのは頭の空行も含めた塊の1行目の行（頭の空行がファイルの空行でなければ `undefined`）。
 * それ以外（一致なし・複数・省略あり・`diff`・空）は `undefined`。
 */
export function codeBlockStartLine(
  block: { readonly language: string; readonly source: string },
  fileContent: string,
): number | undefined {
  if (block.language === "diff") {
    return undefined
  }
  const lines = block.source.split("\n").map(rstrip)
  if (lines.some((line) => OMISSION_LINE.test(line.trim()))) {
    return undefined
  }
  const [segment] = segmentsOf(lines)
  if (segment === undefined || segment.length === 0) {
    return undefined
  }
  const fileLines = fileContent.split("\n").map(rstrip)
  const [only, ...others] = contiguousStarts(fileLines, segment)
  if (only === undefined || others.length > 0) {
    return undefined
  }
  const leadingBlanks = lines.findIndex((line) => line !== "")
  const first = only - leadingBlanks
  const blanksMatch = fileLines.slice(first, only).every((line) => line === "")
  return first < 0 || !blanksMatch ? undefined : first + 1
}

function rstrip(line: string): string {
  return line.replace(/[ \t\r]+$/, "")
}

function diffContentLines(source: string): readonly string[] {
  return source.split("\n").flatMap((line) => {
    if (line.startsWith("-") || DIFF_HEADER_LINE.test(line)) {
      return []
    }
    return line.startsWith("+") || line.startsWith(" ") ? [line.slice(1)] : [line]
  })
}

/** 省略の行で区切った断片の並び（省略の行そのものと、各断片の頭と末尾の空行は含めない）。 */
function segmentsOf(lines: readonly string[]): readonly (readonly string[])[] {
  const final = lines.reduce<{
    readonly segments: readonly (readonly string[])[]
    readonly current: readonly string[]
  }>(
    (state, line) =>
      OMISSION_LINE.test(line.trim())
        ? { segments: [...state.segments, state.current], current: [] }
        : { ...state, current: [...state.current, line] },
    { segments: [], current: [] },
  )
  return [...final.segments, final.current].map(trimBlankEnds)
}

function trimBlankEnds(segment: readonly string[]): readonly string[] {
  const first = segment.findIndex((line) => line !== "")
  const last = segment.findLastIndex((line) => line !== "")
  return first === -1 ? [] : segment.slice(first, last + 1)
}

/** 各断片が、前の断片より後ろでファイルの行に連続して現れるか。空の断片は要求しない。 */
function matchesSegments(
  fileLines: readonly string[],
  segments: readonly (readonly string[])[],
): boolean {
  const result = segments.reduce(
    (state, segment) => {
      if (!state.ok || segment.length === 0) {
        return state
      }
      const at = indexOfContiguous(fileLines, segment, state.cursor)
      return at === -1
        ? { ok: false, cursor: state.cursor }
        : { ok: true, cursor: at + segment.length }
    },
    { ok: true, cursor: 0 },
  )
  return result.ok
}

function contiguousStarts(
  haystack: readonly string[],
  needle: readonly string[],
): readonly number[] {
  return haystack
    .map((_, at) => at)
    .filter(
      (at) =>
        at + needle.length <= haystack.length &&
        needle.every((line, offset) => haystack[at + offset] === line),
    )
}

function indexOfContiguous(
  haystack: readonly string[],
  needle: readonly string[],
  from: number,
): number {
  for (let at = from; at + needle.length <= haystack.length; at++) {
    if (needle.every((line, offset) => haystack[at + offset] === line)) {
      return at
    }
  }
  return -1
}
