// 日付を固定したコミットで、成果（コミットの数）の履歴を組み立てる道具。
// 成果はコミットの日付（committer date）で決まるので、実行した日に依らず同じ結果になるよう固定する。

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import type { ReadAchievementResult } from "../../src/server/achievement/adapter/main-history.ts"
import type { DailyAchievement } from "../../src/shared/achievement/achievement.ts"
import { git } from "./git-repository.ts"
import { runSubprocessOrThrow } from "./subprocess.ts"

/**
 * `date`（`YYYY-MM-DD`）の `hhmm` を、`readAchievement` が読む `Temporal.Now.timeZoneId()` と
 * 同じゾーンのローカル時刻として絶対時刻（オフセット付き ISO）に直す。固定のオフセット
 * （`+09:00` 決め打ち）は使わない——単体テストの設定がプロセスの `TZ` を `UTC` に固定する
 * （ホストが JST でも変わらない）ため、決め打つと `localDateEpochRange` が見る日の境界と
 * ずれ、境界に近い時刻のコミットが意図と違う日に数えられる。 */
export function isoDateAt(date: string, hhmm: string): string {
  const zone = Temporal.Now.timeZoneId()
  return Temporal.PlainDateTime.from(`${date}T${hhmm}:00`)
    .toZonedDateTime(zone)
    .toString({ timeZoneName: "never" })
}

/**
 * ローカル時刻の `date`（`YYYY-MM-DD`）の `hhmm` に、架空のファイルを1件コミットする。
 * committer date と author date を両方固定する（成果はコミットの日付=committer date で
 * 決まるので、これを固定しないとテストの実行日に結果が変わる）。 */
export async function commitAt(
  cwd: string,
  date: string,
  hhmm: string,
  fileName: string,
  content = "架空の内容",
): Promise<void> {
  const path = join(cwd, fileName)
  mkdirSync(join(cwd, ...fileName.split("/").slice(0, -1)), { recursive: true })
  writeFileSync(path, content)
  await git(cwd, "add", fileName)
  const isoDate = isoDateAt(date, hhmm)
  await runSubprocessOrThrow("git", ["commit", "-q", "-m", `commit ${fileName}`], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
}

/**
 * 「読めた」かつ `doneTasks` が数えられている前提のテストで使う。前提が崩れたら例外を投げて
 * 落とす（`toMatchObject` / `toEqual` の食い違いより先に、なぜ崩れたかが分かる）。 */
export function known(result: ReadAchievementResult): Extract<DailyAchievement, { kind: "known" }> {
  if (result.kind !== "ok" || result.achievement.kind !== "known") {
    throw new Error("known な achievement ではなかった")
  }
  return result.achievement
}
