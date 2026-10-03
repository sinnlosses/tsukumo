// コミットの数と節目を数える判断だけを持つ。ファイル I/O も `git` も触らない純関数で、`main` の上から実際に読むのは呼び出し側。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはコミットの数だけ。

import { isTaskLedgerPath } from "../../../shared/repository/task-file-ledger.ts"

/** `git log` から読んだコミット1件（呼び出し側が `--name-only` の出力を割ったもの）。 */
export type AchievementCommit = {
  readonly hash: string
  /** committer date（`%ct`）。エポック秒（`git log` の単位のまま。ミリ秒に直さない）。 */
  readonly committedAtEpochSeconds: number
  readonly changedFiles: readonly string[]
}

/**
 * `[startEpochSeconds, endEpochSeconds)` に committer date が入り、変更したファイルがすべて運用の帳面のものではないコミットだけを数える。
 * merge commit は `git log --no-merges` で既に除かれている前提。
 * 変更ファイルが0件（空コミット）は「すべて帳面」に含めて外す。
 */
export function countAchievementCommits(
  commits: readonly AchievementCommit[],
  startEpochSeconds: number,
  endEpochSeconds: number,
): number {
  return achievementCommitsInRange(commits, startEpochSeconds, endEpochSeconds).length
}

/** {@link countAchievementCommits} と同じ絞り込みで、該当するコミットそのもの（渡された並び順のまま）を返す。 */
export function achievementCommitsInRange(
  commits: readonly AchievementCommit[],
  startEpochSeconds: number,
  endEpochSeconds: number,
): readonly AchievementCommit[] {
  return commits.filter(
    (commit) =>
      commit.committedAtEpochSeconds >= startEpochSeconds &&
      commit.committedAtEpochSeconds < endEpochSeconds &&
      !commit.changedFiles.every(isTaskLedgerPath),
  )
}

/** コミットの節目の刻み（仮）。 */
export const COMMIT_MILESTONE_STEP = 1000

/**
 * コミットの節目。その日のコミットを committer date の順に、前の日の終わりまでの通算の数に足していき、{@link COMMIT_MILESTONE_STEP} の倍数に届いたものを返す。
 * 時刻（`HH:MM`）はここでは組み立てない（OS のタイムゾーンを読むので adapter で組む）。
 */
export function commitMilestoneOf(
  todaysCommitEpochSeconds: readonly number[],
  totalBeforeToday: number,
): { readonly count: number; readonly committedAtEpochSeconds: number } | undefined {
  const sorted = [...todaysCommitEpochSeconds].sort((a, b) => a - b)
  let running = totalBeforeToday
  let crossed: { readonly count: number; readonly committedAtEpochSeconds: number } | undefined
  for (const epochSeconds of sorted) {
    running += 1
    if (running % COMMIT_MILESTONE_STEP === 0) {
      crossed = { count: running, committedAtEpochSeconds: epochSeconds }
    }
  }
  return crossed
}

/** {@link AchievementCommit} に、committer date をローカルの日付に直したものを添えたもの。 */
export type AchievementCommitWithDate = AchievementCommit & { readonly localDateKey: string }

/**
 * 暦ぶんのコミットを、日付キーごとのコミット数に畳む（運用の帳面だけを触ったコミットは除く）。
 * merge commit は `git log --no-merges` で既に除かれている前提。
 * コミットが無い日はキーごと出てこない。
 */
export function achievementCommitCountsByDate(
  commits: readonly AchievementCommitWithDate[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const commit of commits) {
    if (commit.changedFiles.every(isTaskLedgerPath)) {
      continue
    }
    counts.set(commit.localDateKey, (counts.get(commit.localDateKey) ?? 0) + 1)
  }
  return counts
}
