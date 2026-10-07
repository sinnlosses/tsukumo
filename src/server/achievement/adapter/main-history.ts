// 数える枝の履歴と Beads の閉じた課題を読み、成果を数える境界。数える判断は core の純関数が持つ。
//
// コミットは作業ツリーのファイルではなく数える枝の上のものを読む。
// 作業ツリーのものは `git merge main` するまで別の作業ツリーの分を知らない。
// 数える枝はプロジェクトの設定（`readProjectSettings`）の主ブランチ（`tasks.mainBranch`）で、設定が無い（ファイルが無い・`tasks` が無い）ときは起こした作業ツリーのいまのブランチ（`HEAD`）。設定が壊れているときは `unknown` にする。
//
// 終えたタスクは Beads の閉じた課題（`closed_at`）だけから数える。`tasks: "off"` のときは `bd` を起こさない。
// `.beads` が無い（`bd where` が見つけない・`bd` が無い）ときは終えたタスクを数えず、`.beads` があるのに `bd` が落ちた・時間切れのときは `{ kind: "unavailable" }`。
//
// 数える枝が読めない（git リポジトリでない・設定の名前のブランチが無い・`HEAD` が枝を指さない・`git` が無い）ときは、コミットの数を `unknown` にして終えたタスクと閉じた日の暦だけを返す。
// Beads も読めない（`.beads` が無い・`tasks: "off"`）ときは `DailyAchievement` の `{ kind: "unknown" }`（200 のまま配ってよい）。
// それ以外の `git` の呼び出しがタイムアウト・失敗したときは `{ kind: "unavailable" }` で、呼び出し側が 503 にする（部分的な数を出さない）。

import { countBy } from "remeda"

import {
  achievementCalendarDateKeys,
  type AchievementCalendar,
} from "../../../shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../shared/achievement/achievement.ts"
import {
  mainBranchRefOf,
  type ProjectSettingsRead,
} from "../../../shared/repository/project-settings.ts"
import type { DoneTask } from "../../../shared/repository/task-summary.ts"
import { localDateEpochRange, localDateKey, localTimeHHMM } from "../../adapter/local-time.ts"
import { doneTasksOfBeadsIssues } from "../../repository/adapter/beads-task.ts"
import {
  readBeadsIssues,
  readBeadsStampOf,
  readBeadsWorkspace,
} from "../../repository/adapter/beads.ts"
import { runGit } from "../../repository/adapter/git.ts"
import { readProjectSettings } from "../../repository/adapter/project-settings.ts"
import {
  achievementCommitCountsByDate,
  countAchievementCommits,
  type AchievementCommit,
  type AchievementCommitWithDate,
} from "../core/achievement-commit.ts"
import { dailyAchievementOf, epochSecondsOf, type DailyCommits } from "../core/daily-achievement.ts"

/** Beads を読んで終えたタスクに畳んだ結果。`missing` は `.beads` が無い、`unavailable` は `.beads` があるのに読めなかった。 */
type AchievementBeadsRead = readonly DoneTask[] | "missing" | "unavailable"

/**
 * 成果の読みが覚えるものの入れ物。配線が1つ作り、{@link readAchievement} と {@link readCommitCalendar} の両方に渡す。
 *
 * - 日ごとの数: 暦の日ごとのコミット数（鍵は日付キー）
 * - 通算の数: 節目に使う、その日の始まりまでの通算のコミット数（鍵は見ている日の日付キー）
 * - Beads の課題: 課題の変化の印が前に読んだときと同じなら `bd list` を起こさず同じ結果を返す
 *
 * コミットの数はどちらも今日の分は覚えない（毎回取り直す）。
 * 覚えた数が後で変わりうるのは、旧形式で過去の日付のコミットが後から `main` に入ったときだけで、そのずれは受け入れる（プロセスを起こし直せば取り直す）。
 */
export type AchievementCache = {
  readonly dailyCountOf: (dateKey: string) => number | undefined
  readonly rememberDailyCount: (dateKey: string, count: number) => void
  readonly totalBeforeDayOf: (dateKey: string) => number | undefined
  readonly rememberTotalBeforeDay: (dateKey: string, total: number) => void
  readonly readBeads: () => Promise<AchievementBeadsRead>
}

/** `cwd` の {@link AchievementCache} を1つ作る。 */
export function createAchievementCache(cwd: string): AchievementCache {
  const dailyCounts = new Map<string, number>()
  const totalsBeforeDay = new Map<string, number>()
  let lastBeadsRead:
    | { readonly stamp: string; readonly read: Promise<AchievementBeadsRead> }
    | undefined = undefined

  return {
    dailyCountOf: (dateKey) => dailyCounts.get(dateKey),
    rememberDailyCount: (dateKey, count) => {
      dailyCounts.set(dateKey, count)
    },
    totalBeforeDayOf: (dateKey) => totalsBeforeDay.get(dateKey),
    rememberTotalBeforeDay: (dateKey, total) => {
      totalsBeforeDay.set(dateKey, total)
    },
    readBeads: async () => {
      const workspace = await readBeadsWorkspace(cwd)
      if (workspace.kind === "missing") {
        return "missing"
      }
      if (workspace.kind === "timed-out") {
        return "unavailable"
      }
      // 印は `bd list` の前に読む（読んでいるあいだの更新を次の読みで拾うため）。
      const stamp = await readBeadsStampOf(workspace.dir)
      if (stamp !== undefined && lastBeadsRead?.stamp === stamp) {
        return lastBeadsRead.read
      }
      const read = readAllBeadsIssues(cwd)
      // 読み始めた時点で覚え、同時に来た読みにも同じ `bd list` を渡す。
      const remembered = stamp === undefined ? undefined : { stamp, read }
      lastBeadsRead = remembered
      const result = await read
      if (typeof result === "string" && lastBeadsRead === remembered) {
        lastBeadsRead = undefined
      }
      return result
    },
  }
}

/** `.beads` が見つかったあとに `bd list` で全件を読む。落ちても時間切れでも `unavailable`。 */
async function readAllBeadsIssues(cwd: string): Promise<AchievementBeadsRead> {
  const beads = await readBeadsIssues(cwd)
  return beads.kind === "issues" ? doneTasksOfBeadsIssues(beads.issues) : "unavailable"
}

/**
 * `git log --since` に持たせる余裕。
 * `--since` はコミットの日付の古いものに続けて当たると辿るのを打ち切る。
 * 日付が前後する履歴（旧形式では作業ツリーで積んだ時刻のままのコミットが後から `main` に入る）でも取りこぼさないように、数える日より7日前から辿って core が範囲で絞る。
 */
const SINCE_MARGIN_DAYS = 7
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** `git log` の1件を1行（`<ハッシュ> <committer date のエポック秒>`）で出す書式。 */
const COMMIT_LOG_FORMAT = "--format=%H %ct"

/**
 * {@link readAchievement} の結果。`unavailable` は一時的な失敗（`git`・`bd` のタイムアウト・失敗）で、呼び出し側が 503 にする。
 * 「数える枝が読めない」は `unavailable` ではなく `{ kind: "ok", achievement: { kind: "unknown" } }`。
 */
export type ReadAchievementResult =
  | { readonly kind: "ok"; readonly achievement: DailyAchievement }
  | { readonly kind: "unavailable" }

/** {@link readCommitCalendar} の結果。`unavailable` は呼び出し側が 503 にする。 */
export type ReadCommitCalendarResult =
  | { readonly kind: "ok"; readonly calendar: AchievementCalendar }
  | { readonly kind: "unavailable" }

/**
 * 成果を1日ぶん読む。`dateKey` は見る日、`today` はサーバのローカル時刻の今日で、どちらも検証済みの `YYYY-MM-DD`。
 */
export async function readAchievement(
  cwd: string,
  dateKey: string,
  today: string,
  cache: AchievementCache,
): Promise<ReadAchievementResult> {
  const settings = await readProjectSettings(cwd)
  if (settings.kind === "invalid") {
    return { kind: "ok", achievement: { kind: "unknown" } }
  }

  const range = localDateEpochRange(dateKey)

  const [commits, beads] = await Promise.all([
    readDailyCommits(cwd, settings, dateKey, today, range, cache),
    settings.kind === "off" ? ("off" as const) : cache.readBeads(),
  ])
  if (commits === "unavailable" || beads === "unavailable") {
    return { kind: "unavailable" }
  }
  if (commits.kind === "unread" && typeof beads === "string") {
    return { kind: "ok", achievement: { kind: "unknown" } }
  }

  return {
    kind: "ok",
    achievement: dailyAchievementOf({
      date: dateKey,
      today,
      range,
      commits,
      tasks:
        typeof beads === "string"
          ? { kind: "untracked" }
          : { kind: "tracked", done: beads, registeredOn: registeredOnOf(beads) },
      timeOf: localTimeHHMM,
    }),
  }
}

/** 1日ぶんのコミットの材料。数える枝が読めなければ `unread`、読めたあとの `git` が失敗・時間切れなら `unavailable`。 */
async function readDailyCommits(
  cwd: string,
  settings: ProjectSettingsRead,
  dateKey: string,
  today: string,
  range: { readonly startEpochMilliseconds: number; readonly endEpochMilliseconds: number },
  cache: AchievementCache,
): Promise<DailyCommits | "unavailable"> {
  const head = await countedHeadCommit(cwd, settings)
  if (head === undefined) {
    return { kind: "unread" }
  }
  const [commits, totalCommitsBeforeToday] = await Promise.all([
    readCommitsSince(
      cwd,
      head,
      range.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
    ),
    totalAchievementCommitsBeforeDay(cwd, head, dateKey, today, range, cache),
  ])
  return commits === undefined || totalCommitsBeforeToday === undefined
    ? "unavailable"
    : { kind: "read", commits, totalCommitsBeforeToday }
}

/** 終えたタスクごとの作った日（タスクID → ローカルの日付キー）。卒業の登録日に使う。 */
function registeredOnOf(done: readonly DoneTask[]): ReadonlyMap<string, string> {
  return new Map(done.map((task) => [task.id, localDateKey(task.createdAtEpochMilliseconds)]))
}

/**
 * その日の始まりまでの通算のコミットの数（節目に使う）。
 * `dateKey` が今日以外なら `cache` の通算の数を先に見て、あれば `git` を起こさず返す。
 * 無ければ履歴の頭から `range.endEpochMilliseconds` までの全コミットを1回読み、`range` の始まりより前のものだけを数えて（今日以外なら）覚える。
 */
async function totalAchievementCommitsBeforeDay(
  cwd: string,
  head: string,
  dateKey: string,
  today: string,
  range: { readonly startEpochMilliseconds: number; readonly endEpochMilliseconds: number },
  cache: AchievementCache,
): Promise<number | undefined> {
  if (dateKey !== today) {
    const cached = cache.totalBeforeDayOf(dateKey)
    if (cached !== undefined) {
      return cached
    }
  }

  const allCommitsUntilEnd = await readAllCommitsUntil(cwd, head, range.endEpochMilliseconds)
  if (allCommitsUntilEnd === undefined) {
    return undefined
  }
  const total = countAchievementCommits(
    allCommitsUntilEnd,
    0,
    epochSecondsOf(range.startEpochMilliseconds),
  )
  if (dateKey !== today) {
    cache.rememberTotalBeforeDay(dateKey, total)
  }
  return total
}

/** 履歴の頭から `untilEpochMs` までの全コミット（`--no-merges`、`git log --until`）。 */
async function readAllCommitsUntil(
  cwd: string,
  head: string,
  untilEpochMs: number,
): Promise<readonly AchievementCommit[] | undefined> {
  const result = await runGit(cwd, [
    "log",
    head,
    "--no-merges",
    `--until=${instantOf(untilEpochMs)}`,
    COMMIT_LOG_FORMAT,
  ])
  return result.kind === "output" ? parseCommitLog(result.stdout) : undefined
}

/**
 * 灯りの暦（直近5週ぶん）を読む。`today` はサーバのローカル時刻の今日。
 * 数える枝が読めれば日ごとのコミットの数、読めなければ Beads で日ごとに閉じた課題の数で描く。
 * `diaryDates` は日記が持つ一覧なので、ここでは常に空を返し、実際の値は配線層が差し替える。
 */
export async function readCommitCalendar(
  cwd: string,
  today: string,
  cache: AchievementCache,
): Promise<ReadCommitCalendarResult> {
  const settings = await readProjectSettings(cwd)
  if (settings.kind === "invalid") {
    return { kind: "ok", calendar: { kind: "unknown" } }
  }
  const head = await countedHeadCommit(cwd, settings)
  if (head !== undefined) {
    return readCommitCountCalendar(cwd, head, today, cache)
  }
  if (settings.kind === "off") {
    return { kind: "ok", calendar: { kind: "unknown" } }
  }

  const beads = await cache.readBeads()
  if (beads === "unavailable") {
    return { kind: "unavailable" }
  }
  if (beads === "missing") {
    return { kind: "ok", calendar: { kind: "unknown" } }
  }
  const countsByDate = countBy(
    beads.map((task) => task.closedAtEpochMilliseconds),
    localDateKey,
  )
  return calendarOf(
    today,
    achievementCalendarDateKeys(today),
    "done-tasks",
    (date) => countsByDate[date] ?? 0,
  )
}

/**
 * 暦の日ごとのコミット数を読む。
 * 範囲の日が1日でも覚えていなければ、`git log` を1回だけ起こして範囲全体を数え直し、今日以外を覚える。
 * すべて覚えていれば、今日の分だけを取り直す。
 */
async function readCommitCountCalendar(
  cwd: string,
  head: string,
  today: string,
  cache: AchievementCache,
): Promise<ReadCommitCalendarResult> {
  const dateKeys = achievementCalendarDateKeys(today)
  const rangeStart = dateKeys[0]
  if (rangeStart === undefined) {
    return { kind: "unavailable" }
  }
  const nonTodayKeys = dateKeys.filter((date) => date !== today)
  const allNonTodayCached = nonTodayKeys.every((date) => cache.dailyCountOf(date) !== undefined)

  if (allNonTodayCached) {
    const todayRange = localDateEpochRange(today)
    const todayCommits = await readCommitsSince(
      cwd,
      head,
      todayRange.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
    )
    if (todayCommits === undefined) {
      return { kind: "unavailable" }
    }
    const todayCount = countAchievementCommits(
      todayCommits,
      epochSecondsOf(todayRange.startEpochMilliseconds),
      epochSecondsOf(todayRange.endEpochMilliseconds),
    )
    return calendarOf(today, dateKeys, "commits", (date) =>
      date === today ? todayCount : (cache.dailyCountOf(date) ?? 0),
    )
  }

  const rangeStartRange = localDateEpochRange(rangeStart)
  const commits = await readCommitsSince(
    cwd,
    head,
    rangeStartRange.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
  )
  if (commits === undefined) {
    return { kind: "unavailable" }
  }
  const commitsWithDate: readonly AchievementCommitWithDate[] = commits.map((commit) => ({
    ...commit,
    localDateKey: localDateKey(commit.committedAtEpochSeconds * 1000),
  }))
  const countsByDate = achievementCommitCountsByDate(commitsWithDate)
  for (const date of nonTodayKeys) {
    cache.rememberDailyCount(date, countsByDate.get(date) ?? 0)
  }

  return calendarOf(today, dateKeys, "commits", (date) => countsByDate.get(date) ?? 0)
}

function calendarOf(
  today: string,
  dateKeys: readonly string[],
  counted: "commits" | "done-tasks",
  countOf: (date: string) => number,
): ReadCommitCalendarResult {
  return {
    kind: "ok",
    calendar: {
      kind: "known",
      today,
      counted,
      days: dateKeys.map((date) => ({ date, count: countOf(date) })),
      diaryDates: [],
    },
  }
}

/**
 * 数える枝の先端。取れなければ `undefined`（「数える枝が読めない」）。
 * 設定があればその主ブランチ、無ければ `HEAD` が指す枝。設定が壊れているときは数えない。
 */
async function countedHeadCommit(
  cwd: string,
  settings: ProjectSettingsRead,
): Promise<string | undefined> {
  if (settings.kind === "invalid") {
    return undefined
  }
  const ref =
    settings.kind === "read" ? mainBranchRefOf(settings.tasks) : await currentBranchRef(cwd)
  if (ref === undefined) {
    return undefined
  }
  const result = await runGit(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
  return result.kind === "output" ? result.stdout.trim() : undefined
}

/** `HEAD` が指す枝の完全な参照名。枝を指さない（detached）ときは `undefined`。 */
async function currentBranchRef(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, ["symbolic-ref", "--quiet", "HEAD"])
  return result.kind === "output" ? result.stdout.trim() : undefined
}

/**
 * `sinceEpochMs` 以降のコミット（`--no-merges`）を、ハッシュと committer date の組で読む。
 * `git` が失敗・タイムアウトしたら `undefined`。
 */
async function readCommitsSince(
  cwd: string,
  head: string,
  sinceEpochMs: number,
): Promise<readonly AchievementCommit[] | undefined> {
  const result = await runGit(cwd, [
    "log",
    head,
    "--no-merges",
    `--since=${instantOf(sinceEpochMs)}`,
    COMMIT_LOG_FORMAT,
  ])
  return result.kind === "output" ? parseCommitLog(result.stdout) : undefined
}

/** `%H %ct` の1行ずつを割る。読めない行はその行だけ捨てる。 */
function parseCommitLog(output: string): readonly AchievementCommit[] {
  return output.split("\n").flatMap((line) => {
    const [hash, committedAt] = line.split(" ")
    const committedAtEpochSeconds = committedAt === undefined ? NaN : Number(committedAt)
    if (hash === undefined || hash === "" || !Number.isInteger(committedAtEpochSeconds)) {
      return []
    }
    return [{ hash, committedAtEpochSeconds }]
  })
}

/**
 * エポックミリ秒を `git` の `--since` / `--until` に渡す ISO 8601（UTC）にする。
 * 絶対時刻なので、サーバのタイムゾーンに関わらず `git` 側で正しく解釈される。
 */
function instantOf(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString()
}
