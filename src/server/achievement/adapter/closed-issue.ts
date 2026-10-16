// Beads の閉じた課題を読み、成果（1日ぶんと灯りの暦）を数える境界。数える判断は core の純関数が持つ。
//
// 終えたタスクは Beads の閉じた課題（`closed_at`）だけから数える。
// `.beads` が無い（`bd where` が見つけない・`bd` が無い）ときは `{ kind: "unknown" }`（200 のまま配ってよい）。
// `.beads` があるのに `bd` が落ちた・時間切れのときは `{ kind: "unavailable" }` で、呼び出し側が 503 にする（部分的な数を出さない）。

import { countBy } from "remeda"

import {
  achievementCalendarDateKeys,
  type AchievementCalendar,
} from "../../../shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../shared/achievement/achievement.ts"
import type { DoneTask } from "../../../shared/repository/task-summary.ts"
import { localDateEpochRange, localDateKey } from "../../adapter/local-time.ts"
import { doneTasksOfBeadsIssues } from "../../repository/adapter/beads-task.ts"
import {
  readBeadsIssues,
  readBeadsStampOf,
  readBeadsWorkspace,
} from "../../repository/adapter/beads.ts"
import { dailyAchievementOf } from "../core/daily-achievement.ts"

/** Beads を読んで終えたタスクに畳んだ結果。`missing` は `.beads` が無い、`unavailable` は `.beads` があるのに読めなかった。 */
type AchievementBeadsRead = readonly DoneTask[] | "missing" | "unavailable"

/**
 * 成果の読みが覚えるものの入れ物。配線が1つ作り、{@link readAchievement} と {@link readAchievementCalendar} の両方に渡す。
 * 課題の変化の印が前に読んだときと同じなら `bd list` を起こさず同じ結果を返す。
 */
export type AchievementCache = {
  readonly readBeads: () => Promise<AchievementBeadsRead>
}

/**
 * `cwd` の {@link AchievementCache} を1つ作る。
 * 印が変わっても、前に読めた結果があればそれを先に返し、`bd list`（1秒ほどかかる）は裏で読み直す。
 * 裏の読みが終われば次の読みから新しい結果が出る。最初の1回だけは読み終わるまで待つ。
 */
export function createAchievementCache(cwd: string): AchievementCache {
  let lastBeadsRead:
    | { readonly stamp: string; readonly read: Promise<AchievementBeadsRead> }
    | undefined = undefined
  let lastDone: readonly DoneTask[] | undefined = undefined
  // `.beads` の場所は見つかった1回だけ `bd where` で調べて覚える（呼ぶたびに調べると1秒ほどかかる）。
  let beadsDir: string | undefined = undefined

  async function readAndRemember(stamp: string | undefined): Promise<AchievementBeadsRead> {
    const result = await readDoneTasks(cwd, stamp)
    if (typeof result !== "string") {
      lastDone = result
    }
    return result
  }

  return {
    readBeads: async () => {
      if (beadsDir === undefined) {
        const workspace = await readBeadsWorkspace(cwd)
        if (workspace.kind === "missing") {
          return "missing"
        }
        if (workspace.kind === "timed-out") {
          return "unavailable"
        }
        beadsDir = workspace.dir
      }
      // 印は `bd list` の前に読む（読んでいるあいだの更新を次の読みで拾うため）。
      const stamp = await readBeadsStampOf(beadsDir)
      if (stamp !== undefined && lastBeadsRead?.stamp === stamp) {
        return lastDone ?? lastBeadsRead.read
      }
      const read = readAndRemember(stamp)
      // 読み始めた時点で覚え、同時に来た読みにも同じ `bd list` を渡す。
      const remembered = stamp === undefined ? undefined : { stamp, read }
      lastBeadsRead = remembered
      const forget = (): void => {
        if (lastBeadsRead === remembered) {
          lastBeadsRead = undefined
        }
      }
      void read.then((result) => {
        if (typeof result === "string") {
          forget()
        }
      })
      return stamp === undefined ? read : (lastDone ?? read)
    },
  }
}

type AchievementRead = { readonly kind: "ok"; readonly achievement: DailyAchievement }
type AchievementCalendarRead = { readonly kind: "ok"; readonly calendar: AchievementCalendar }
type BeadsUnavailable = { readonly kind: "unavailable" }

/** {@link readAchievement} の結果。`unavailable` は呼び出し側が 503 にする。 */
export type ReadAchievementResult = AchievementRead | BeadsUnavailable

/** {@link readAchievementCalendar} の結果。`unavailable` は呼び出し側が 503 にする。 */
export type ReadAchievementCalendarResult = AchievementCalendarRead | BeadsUnavailable

/**
 * 成果を1日ぶん読む。`dateKey` は見る日、`today` はサーバのローカル時刻の今日で、どちらも検証済みの `YYYY-MM-DD`。
 */
export function readAchievement(
  dateKey: string,
  today: string,
  cache: AchievementCache,
): Promise<ReadAchievementResult> {
  return readBeadsWith<AchievementRead>(
    cache,
    { kind: "ok", achievement: { kind: "unknown" } },
    (done) => ({
      kind: "ok",
      achievement: dailyAchievementOf({
        date: dateKey,
        today,
        range: localDateEpochRange(dateKey),
        done,
        registeredOn: registeredOnOf(done),
      }),
    }),
  )
}

/**
 * 灯りの暦（直近5週ぶん）を、日ごとに閉じた課題の数で読む。`today` はサーバのローカル時刻の今日。
 * `diaryDates` は日記が持つ一覧なので、ここでは常に空を返し、実際の値は配線層が差し替える。
 */
export function readAchievementCalendar(
  today: string,
  cache: AchievementCache,
): Promise<ReadAchievementCalendarResult> {
  return readBeadsWith<AchievementCalendarRead>(
    cache,
    { kind: "ok", calendar: { kind: "unknown" } },
    (done) => {
      const countsByDate = countBy(
        done.map((task) => task.closedAtEpochMilliseconds),
        localDateKey,
      )
      return {
        kind: "ok",
        calendar: {
          kind: "known",
          today,
          days: achievementCalendarDateKeys(today).map((date) => ({
            date,
            count: countsByDate[date] ?? 0,
          })),
          diaryDates: [],
        },
      }
    },
  )
}

/** `.beads` が見つかったあとに全件の読み（一覧と共有）から閉じた課題を取り出す。落ちても時間切れでも `unavailable`。 */
async function readDoneTasks(
  cwd: string,
  stamp: string | undefined,
): Promise<AchievementBeadsRead> {
  const beads = await readBeadsIssues(cwd, stamp)
  return beads.kind === "issues" ? doneTasksOfBeadsIssues(beads.issues) : "unavailable"
}

/** Beads を読み、終えたタスクを `toResult` で結果に組む。 */
async function readBeadsWith<Result>(
  cache: AchievementCache,
  missing: Result,
  toResult: (done: readonly DoneTask[]) => Result,
): Promise<Result | BeadsUnavailable> {
  const beads = await cache.readBeads()
  if (beads === "unavailable") {
    return { kind: "unavailable" }
  }
  return beads === "missing" ? missing : toResult(beads)
}

/** 終えたタスクごとの作った日（タスクID → ローカルの日付キー）。卒業の登録日に使う。 */
function registeredOnOf(done: readonly DoneTask[]): ReadonlyMap<string, string> {
  return new Map(done.map((task) => [task.id, localDateKey(task.createdAtEpochMilliseconds)]))
}
