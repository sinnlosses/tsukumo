// 直近の commit の日と、その commit が触ったファイル（`cwd` からの相対）を1回の `git log` で読む。

import { runGit } from "./git.ts"

/** commit 1件。`date` は YYYY-MM-DD。 */
export type RecentCommit = {
  readonly date: string
  readonly paths: readonly string[]
}

const RECORD_SEPARATOR = "\u001e"

/** 読めた回は `read`、数えられなかった回（失敗・時間切れ）は `uncounted`。 */
export type RecentCommitLog =
  | { readonly kind: "read"; readonly commits: readonly RecentCommit[] }
  | { readonly kind: "uncounted" }

/** `since` 以降の commit を新しい順に返す。 */
export async function listRecentCommits(cwd: string, since: string): Promise<RecentCommitLog> {
  const outcome = await runGit(cwd, [
    "-c",
    "core.quotePath=false",
    "log",
    `--since=${since}`,
    "--relative",
    "--no-renames",
    "--name-only",
    "--format=%x1e%cs",
  ])
  if (outcome.kind !== "output") {
    return { kind: "uncounted" }
  }
  const commits = outcome.stdout
    .split(RECORD_SEPARATOR)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [date = "", ...lines] = record.split("\n")
      return { date: date.trim(), paths: lines.filter((line) => line.trim() !== "") }
    })
  return { kind: "read", commits }
}
