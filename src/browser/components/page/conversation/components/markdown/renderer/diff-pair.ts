// `diff` のフェンスの行から、語の差分を取る `-` と `+` の対を見つける。

import { diffWords, type TextRange } from "./word-diff.ts"

/** 行の添字 → 違う語の区間。`side` は行が `-`（removed）か `+`（added）か。 */
export type DiffWordRanges = ReadonlyMap<number, DiffLineWords>

export type DiffLineWords = {
  readonly side: "removed" | "added"
  readonly ranges: readonly TextRange[]
}

/**
 * 対の行ごとの、違う語の区間。区間は先頭の `+`/`-` の1字を含む行の添字で言う。
 * 対にならない行と、語が多すぎる行は入らない。
 */
export function diffWordRanges(source: string): DiffWordRanges {
  const lines = source.split("\n")
  return new Map(
    [...pairDiffLines(lines)].flatMap(([removed, added]) => {
      const result = diffWords((lines[removed] ?? "").slice(1), (lines[added] ?? "").slice(1))
      const entries: readonly (readonly [number, DiffLineWords])[] = [
        [removed, { side: "removed", ranges: shift(result.before) }],
        [added, { side: "added", ranges: shift(result.after) }],
      ]
      return entries.filter(([, value]) => value.ranges.length > 0)
    }),
  )
}

/**
 * `-` の連続が n 行、直後に `+` の連続がちょうど n 行のときだけ、同じ順の行どうしを対にする。
 * 返す Map は `-` の行の添字から対の `+` の行の添字。`---`/`+++` で始まるファイルの頭の行は対にしない。
 */
export function pairDiffLines(lines: readonly string[]): ReadonlyMap<number, number> {
  return new Map(pairsFrom(lines, 0))
}

function pairsFrom(lines: readonly string[], from: number): readonly (readonly [number, number])[] {
  if (from >= lines.length) {
    return []
  }
  const removed = runLength(lines, from, "-")
  const added = removed === 0 ? 0 : runLength(lines, from + removed, "+")
  const here =
    removed > 0 && removed === added
      ? Array.from({ length: removed }, (_, offset): readonly [number, number] => [
          from + offset,
          from + removed + offset,
        ])
      : []
  return [...here, ...pairsFrom(lines, from + Math.max(removed + added, 1))]
}

function shift(ranges: readonly TextRange[]): readonly TextRange[] {
  return ranges.map((range) => ({ start: range.start + 1, end: range.end + 1 }))
}

/** `from` から続く、`sign` で始まる行（ファイルの頭の `---`/`+++` を除く）の数。 */
function runLength(lines: readonly string[], from: number, sign: "-" | "+"): number {
  const end = lines.findIndex(
    (line, index) => index >= from && !(line.startsWith(sign) && !line.startsWith(sign.repeat(3))),
  )
  return (end === -1 ? lines.length : end) - from
}
