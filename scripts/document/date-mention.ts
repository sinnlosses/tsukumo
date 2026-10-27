// `docs/` の正典（`docs/architecture/adr/`・`docs/history/`・`docs/research/` を除く）に書かれた
// `20\d\d-\d\d-\d\d` の日付を行ごとに拾い、範囲ごとに数える純粋関数。
//
// 拾わないのは2つ。日付入りのファイル名（拡張子で終わる語）と、「…」で引いた節名の中の日付。

/** 日付を含む行1件。 */
export type DateMention = {
  readonly sourcePath: string
  readonly line: number
}

const DATE_PATTERN = /20\d\d-\d\d-\d\d/u
const DATED_FILE_NAME_PATTERN = /[\w./-]*20\d\d-\d\d-\d\d[\w-]*\.(?:html|png|md|json|jpg|svg)/gu
const QUOTED_SECTION_NAME_PATTERN = /「[^」]*20\d\d-\d\d-\d\d[^」]*」/gu

/** ファイル1つの本文から、日付を含む行（ファイル名・節名の日付だけの行を除く）を拾う。 */
export function findDateMentions(sourcePath: string, text: string): DateMention[] {
  return text.split("\n").flatMap((lineText, index) => {
    const remaining = lineText
      .replaceAll(QUOTED_SECTION_NAME_PATTERN, "")
      .replaceAll(DATED_FILE_NAME_PATTERN, "")
    return DATE_PATTERN.test(remaining) ? [{ sourcePath, line: index + 1 }] : []
  })
}

/**
 * ファイルの範囲の名前。`docs/architecture/<子>/…` は `architecture/<子>`、
 * `docs/architecture/` 直下は `architecture`、`docs/<子>/…` は `<子>`、`docs/` 直下は `docs-root`。
 */
export function rangeOf(sourcePath: string): string {
  const segments = sourcePath.split("/").slice(1)
  const [first, second] = segments
  if (segments.length === 1 || first === undefined) {
    return "docs-root"
  }
  if (first === "architecture") {
    return segments.length > 2 && second !== undefined ? `architecture/${second}` : "architecture"
  }
  return first
}

/** 範囲ごとの行数。 */
export function countByRange(mentions: readonly DateMention[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const mention of mentions) {
    const range = rangeOf(mention.sourcePath)
    counts[range] = (counts[range] ?? 0) + 1
  }
  return counts
}

/** 凍結した一覧と実際の行数を照らし、食い違いを説明する行にする。 */
export function findFrozenMismatches(
  frozen: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): string[] {
  const ranges = [...new Set([...Object.keys(frozen), ...Object.keys(actual)])].toSorted()
  return ranges.flatMap((range) => {
    const frozenCount = frozen[range] ?? 0
    const actualCount = actual[range] ?? 0
    if (actualCount > frozenCount) {
      return [
        `${range}: 日付の行が ${actualCount} 行で、凍結した ${frozenCount} 行を超えた（日付は書かない）`,
      ]
    }
    if (actualCount < frozenCount) {
      return [
        `${range}: 日付の行が ${actualCount} 行に減った。凍結の一覧の値を ${actualCount} へ下げる`,
      ]
    }
    return []
  })
}
