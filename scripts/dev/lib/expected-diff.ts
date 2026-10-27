// `pnpm run check` の最後に出す、E2E の期待値（`test/e2e/expected/`）の差分行数の `STAGE` 行を組む。
// 行の見方の正典は `docs/architecture/testing/e2e-artifact-and-expectation.md`「置き場所と比べ方」。

/** 差分を数える置き場（リポジトリ直下からの相対パス）。 */
export const EXPECTED_DIRECTORY = "test/e2e/expected"

/** `STAGE` 行の段名。値は4値ではなく行数なので、`tw verify` の4値の読み手は読み飛ばす。 */
const EXPECTED_DIFF_STAGE_NAME = "expected-diff"

/**
 * 追跡しているファイルの `git diff --numstat` の出力と、未追跡のファイルの中身から、
 * 足した行と消した行の和を返す。未追跡のファイルは全行を足した行に数える。
 * 二進のファイル（`-`）は数えない。
 */
export function countExpectedDiffLines(numstat: string, untrackedTexts: readonly string[]): number {
  const tracked = numstat
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"))
    .reduce((sum, [added = "-", deleted = "-"]) => sum + lineCount(added) + lineCount(deleted), 0)
  const untracked = untrackedTexts.reduce((sum, text) => sum + textLineCount(text), 0)
  return tracked + untracked
}

export function formatExpectedDiffLine(lines: number): string {
  return `STAGE\t${EXPECTED_DIFF_STAGE_NAME}\t${String(lines)}`
}

function lineCount(field: string): number {
  const count = Number(field)
  return Number.isInteger(count) ? count : 0
}

/** 改行で終わらない最後の行も1行に数える（`git diff --numstat` と同じ数え方）。 */
function textLineCount(text: string): number {
  if (text === "") {
    return 0
  }
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0)
}
