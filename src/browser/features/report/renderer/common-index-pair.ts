// 2つの並びの最長共通部分列（LCS）を、共通の要素の添字の対で返す。

/** LCS で共通の要素の添字の対（left の添字, right の添字）を前から順に返す。 */
export function commonIndexPairs(
  left: readonly string[],
  right: readonly string[],
): readonly (readonly [number, number])[] {
  return commonPairs(left, right, commonLengths(left, right), 0, 0)
}

/** `lengths[i][j]` は left[i..] と right[j..] の共通部分列の長さ。 */
function commonLengths(
  left: readonly string[],
  right: readonly string[],
): readonly (readonly number[])[] {
  const emptyRow: readonly number[] = Array.from({ length: right.length + 1 }, () => 0)
  return left.reduceRight<readonly (readonly number[])[]>(
    (below, leftText) => {
      const next = below[0] ?? emptyRow
      const row = right.reduceRight<readonly number[]>(
        (done, rightText, j) => [
          leftText === rightText ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, done[0] ?? 0),
          ...done,
        ],
        [0],
      )
      return [row, ...below]
    },
    [emptyRow],
  )
}

function commonPairs(
  left: readonly string[],
  right: readonly string[],
  lengths: readonly (readonly number[])[],
  i: number,
  j: number,
): readonly (readonly [number, number])[] {
  if (i >= left.length || j >= right.length) {
    return []
  }
  if (left[i] === right[j]) {
    return [[i, j], ...commonPairs(left, right, lengths, i + 1, j + 1)]
  }
  const down = lengths[i + 1]?.[j] ?? 0
  const across = lengths[i]?.[j + 1] ?? 0
  return down >= across
    ? commonPairs(left, right, lengths, i + 1, j)
    : commonPairs(left, right, lengths, i, j + 1)
}
