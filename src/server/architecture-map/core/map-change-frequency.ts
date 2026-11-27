// 箱の paths の glob に当たる直近の commit の数と最終の日。

import type { GlobMatches } from "./report-map.ts"

const WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** commit 1件（構造の型。日は YYYY-MM-DD）。 */
export type ChangeCommit = {
  readonly date: string
  readonly paths: readonly string[]
}

export type ChangeFrequency = {
  readonly commitCount: number
  readonly lastChangedOn?: string
}

/** `now`（ミリ秒）の 30 日前。`git log --since` へ渡す。 */
export function changeWindowStartOf(now: number): string {
  return Temporal.Instant.fromEpochMilliseconds(now - WINDOW_DAYS * DAY_MS).toString()
}

/** どれかの glob に当たるパスを触った commit を1回ずつ数える。照らしは一意のパスごとに glob 1回。 */
export function changeFrequencyOf(
  globs: readonly string[],
  commits: readonly ChangeCommit[],
  matches: GlobMatches,
): ChangeFrequency {
  const matched = new Set<string>()
  const seen = new Set<string>()
  for (const commit of commits) {
    for (const path of commit.paths) {
      if (!seen.has(path)) {
        seen.add(path)
        if (globs.some((glob) => matches(path, glob))) {
          matched.add(path)
        }
      }
    }
  }
  let commitCount = 0
  let lastChangedOn: string | undefined
  for (const commit of commits) {
    if (commit.paths.some((path) => matched.has(path))) {
      commitCount += 1
      if (lastChangedOn === undefined || commit.date > lastChangedOn) {
        lastChangedOn = commit.date
      }
    }
  }
  return lastChangedOn === undefined ? { commitCount } : { commitCount, lastChangedOn }
}
