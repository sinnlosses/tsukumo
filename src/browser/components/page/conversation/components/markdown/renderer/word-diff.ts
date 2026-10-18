// 2つの行を語に切り、LCS で共通でない語の区間を返す。

/** 文字列の区間（UTF-16 の添字、`end` は含まない）。 */
export type TextRange = { readonly start: number; readonly end: number }

type WordDiff = {
  readonly before: readonly TextRange[]
  readonly after: readonly TextRange[]
}

/** どちらかの行の語がこの数を超えたら比べない。 */
const WORD_DIFF_MAX_WORDS = 200

const WORD = /[\p{L}\p{N}_]+|\s+|[^]/gu

type Word = { readonly text: string; readonly range: TextRange }

/** 語は英数字と `_` の連なり・空白の連なり・それ以外の記号1字。語が上限を超えたら両側とも空。 */
export function diffWords(before: string, after: string): WordDiff {
  const left = splitWords(before)
  const right = splitWords(after)
  if (left.length > WORD_DIFF_MAX_WORDS || right.length > WORD_DIFF_MAX_WORDS) {
    return { before: [], after: [] }
  }
  const common = commonPairs(left, right, commonLengths(left, right), 0, 0)
  return {
    before: unmatchedRanges(left, new Set(common.map(([index]) => index))),
    after: unmatchedRanges(right, new Set(common.map(([, index]) => index))),
  }
}

function splitWords(text: string): readonly Word[] {
  return Array.from(text.matchAll(WORD), (match) => ({
    text: match[0],
    range: { start: match.index, end: match.index + match[0].length },
  }))
}

/** `lengths[i][j]` は left[i..] と right[j..] の共通部分列の長さ。 */
function commonLengths(
  left: readonly Word[],
  right: readonly Word[],
): readonly (readonly number[])[] {
  const emptyRow: readonly number[] = Array.from({ length: right.length + 1 }, () => 0)
  return left.reduceRight<readonly (readonly number[])[]>(
    (below, leftWord) => {
      const next = below[0] ?? emptyRow
      const row = right.reduceRight<readonly number[]>(
        (done, rightWord, j) => [
          leftWord.text === rightWord.text
            ? (next[j + 1] ?? 0) + 1
            : Math.max(next[j] ?? 0, done[0] ?? 0),
          ...done,
        ],
        [0],
      )
      return [row, ...below]
    },
    [emptyRow],
  )
}

/** 共通の語の添字の対（left の添字, right の添字）を前から順に返す。 */
function commonPairs(
  left: readonly Word[],
  right: readonly Word[],
  lengths: readonly (readonly number[])[],
  i: number,
  j: number,
): readonly (readonly [number, number])[] {
  if (i >= left.length || j >= right.length) {
    return []
  }
  if (left[i]?.text === right[j]?.text) {
    return [[i, j], ...commonPairs(left, right, lengths, i + 1, j + 1)]
  }
  const down = lengths[i + 1]?.[j] ?? 0
  const across = lengths[i]?.[j + 1] ?? 0
  return down >= across
    ? commonPairs(left, right, lengths, i + 1, j)
    : commonPairs(left, right, lengths, i, j + 1)
}

/** 共通でない語を、隣り合うものは1つにつないで区間にする。 */
function unmatchedRanges(
  words: readonly Word[],
  matched: ReadonlySet<number>,
): readonly TextRange[] {
  return words.reduce<readonly TextRange[]>((ranges, word, index) => {
    if (matched.has(index)) {
      return ranges
    }
    const last = ranges.at(-1)
    return last !== undefined && last.end === word.range.start
      ? [...ranges.slice(0, -1), { start: last.start, end: word.range.end }]
      : [...ranges, word.range]
  }, [])
}
