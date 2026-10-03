// `main` の履歴を読み、成果を数える境界。数える判断は core の純関数が持つ。
//
// 読むのは作業ツリーのファイルではなく `main` の上のもの。
// 作業ツリーのものは `git merge main` するまで別の作業ツリーの分を知らない。
// 例外はプロジェクトの設定（`readProjectSettings`）で、主ブランチの名前（`tasks.mainBranch`）とタスクの方式をここから読む。設定が無い・読めないときは主ブランチを読まず、`unknown` にする。
//
// Beads 方式（プロジェクトの設定の `tasks.store` が `beads`）では、終えたタスクを git の切り口と Beads の閉じた課題（`closed_at`）の両方から読み、ID で和をとる。
// 移す前は Beads に閉じた課題が無く、移したあとは `main` にタスクファイルが無いので、境を数で持たなくても欠けず、同じ ID が両方にあっても1件にしかならない。
//
// 主ブランチが読めない（git リポジトリでない・設定の名前のブランチが無い・`git` が無い）ときは `DailyAchievement` の `{ kind: "unknown" }`（200 のまま配ってよい）。
// それ以外の `git` の呼び出しがタイムアウト・失敗したときは `{ kind: "unavailable" }` で、呼び出し側が 503 にする（部分的な数を出さない）。

import { basename } from "node:path"

import {
  achievementCalendarDateKeys,
  type AchievementCalendar,
} from "../../../shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../shared/achievement/achievement.ts"
import { taskIdOfBeadsId, type BeadsIssue } from "../../../shared/repository/beads-issue.ts"
import { mainBranchRefOf, type TaskSettings } from "../../../shared/repository/project-settings.ts"
import {
  LEGACY_ARCHIVE_PATH,
  LEGACY_TASKS_PATH,
  TASK_LEDGER_HISTORY_PATHS,
  taskFileIdOfPath,
} from "../../../shared/repository/task-file-ledger.ts"
import { TASK_DIR_PATH } from "../../../shared/repository/task-summary.ts"
import { localDateEpochRange, localDateKey, localTimeHHMM } from "../../adapter/local-time.ts"
import { readBeadsIssues } from "../../repository/adapter/beads.ts"
import { runGit, runGitCatFileBatch } from "../../repository/adapter/git.ts"
import { readProjectSettings } from "../../repository/adapter/project-settings.ts"
import {
  achievementCommitCountsByDate,
  countAchievementCommits,
  type AchievementCommit,
  type AchievementCommitWithDate,
} from "../core/achievement-commit.ts"
import { dailyAchievementOf, epochSecondsOf } from "../core/daily-achievement.ts"
import { hasTaskTracking, type TaskSnapshotSource } from "../core/done-task-source.ts"
import type {
  DeletedTaskFile,
  TaskFileChange,
  TaskFileHistoryCommit,
} from "../core/task-file-history.ts"

/**
 * 今日以外の日の数を覚える入れ物。配線が1つ作り、{@link readAchievement} と {@link readCommitCalendar} の両方に渡す。
 *
 * - 日ごとの数: 暦の日ごとのコミット数（鍵は日付キー）
 * - 通算の数: 節目に使う、その日の始まりまでの通算のコミット数（鍵は見ている日の日付キー）
 *
 * どちらも今日の分は覚えない（毎回取り直す）。
 * 覚えた数が後で変わりうるのは、旧形式で過去の日付のコミットが後から `main` に入ったときだけで、そのずれは受け入れる（プロセスを起こし直せば取り直す）。
 */
export type AchievementCommitCache = {
  readonly dailyCountOf: (dateKey: string) => number | undefined
  readonly rememberDailyCount: (dateKey: string, count: number) => void
  readonly totalBeforeDayOf: (dateKey: string) => number | undefined
  readonly rememberTotalBeforeDay: (dateKey: string, total: number) => void
}

/** {@link AchievementCommitCache} を1つ作る。 */
export function createAchievementCommitCache(): AchievementCommitCache {
  const dailyCounts = new Map<string, number>()
  const totalsBeforeDay = new Map<string, number>()
  return {
    dailyCountOf: (dateKey) => dailyCounts.get(dateKey),
    rememberDailyCount: (dateKey, count) => {
      dailyCounts.set(dateKey, count)
    },
    totalBeforeDayOf: (dateKey) => totalsBeforeDay.get(dateKey),
    rememberTotalBeforeDay: (dateKey, total) => {
      totalsBeforeDay.set(dateKey, total)
    },
  }
}

/**
 * `git log --since` に持たせる余裕。
 * `--since` はコミットの日付の古いものに続けて当たると辿るのを打ち切る。
 * 日付が前後する履歴（旧形式では作業ツリーで積んだ時刻のままのコミットが後から `main` に入る）でも取りこぼさないように、数える日より7日前から辿って core が範囲で絞る。
 */
const SINCE_MARGIN_DAYS = 7
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * `git log` の1件を区切る印（ファイル名に出てこない前提）。
 * NUL（`\x00`）は使えない。`node:child_process` の `execFile` は引数に NUL を含む文字列を渡すと例外を投げる。
 */
const COMMIT_RECORD_SEPARATOR = "\x1e"

/**
 * {@link readAchievement} の結果。`unavailable` は一時的な失敗（`git` のタイムアウト・失敗）で、呼び出し側が 503 にする。
 * 「`main` が読めない」は `unavailable` ではなく `{ kind: "ok", achievement: { kind: "unknown" } }`。
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
  cache: AchievementCommitCache,
): Promise<ReadAchievementResult> {
  const settings = await readProjectSettings(cwd)
  const head = settings.kind === "read" ? await mainHeadCommit(cwd, settings.tasks) : undefined
  if (settings.kind !== "read" || head === undefined) {
    return { kind: "ok", achievement: { kind: "unknown" } }
  }

  const range = localDateEpochRange(dateKey)

  const [commits, totalCommitsBeforeToday, headSource, beads] = await Promise.all([
    readCommitsSince(
      cwd,
      head,
      range.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
    ),
    totalAchievementCommitsBeforeDay(cwd, head, dateKey, today, range, cache),
    readTaskSnapshotSource(cwd, head),
    readBeadsIssuesOfStore(cwd, settings.tasks),
  ])
  if (commits === undefined) {
    return { kind: "unavailable" }
  }
  if (totalCommitsBeforeToday === undefined) {
    return { kind: "unavailable" }
  }

  if (headSource === "unavailable") {
    return { kind: "unavailable" }
  }
  if (beads === "unavailable") {
    return { kind: "unavailable" }
  }
  if (beads === "files" && !hasTaskTracking(headSource)) {
    return {
      kind: "ok",
      achievement: dailyAchievementOf({
        date: dateKey,
        today,
        range,
        commits,
        totalCommitsBeforeToday,
        tasks: { kind: "untracked" },
        timeOf: localTimeHHMM,
      }),
    }
  }

  const [todayCutoff, yesterdayCutoff] = await Promise.all([
    cutoffCommitBefore(cwd, head, range.endEpochMilliseconds),
    cutoffCommitBefore(cwd, head, range.startEpochMilliseconds),
  ])
  if (todayCutoff.kind === "unavailable" || yesterdayCutoff.kind === "unavailable") {
    return { kind: "unavailable" }
  }

  const [todaySource, yesterdaySource] = await Promise.all([
    readTaskSnapshotSource(cwd, cutoffCommitOf(todayCutoff)),
    readTaskSnapshotSource(cwd, cutoffCommitOf(yesterdayCutoff)),
  ])
  if (todaySource === "unavailable" || yesterdaySource === "unavailable") {
    return { kind: "unavailable" }
  }

  const history = await readTaskFileHistory(cwd, head)
  if (history === undefined) {
    return { kind: "unavailable" }
  }
  const deletedFiles = await readDeletedTaskFiles(cwd, history.deletions)
  if (deletedFiles === undefined) {
    return { kind: "unavailable" }
  }
  const issues = beads === "files" ? [] : beads

  return {
    kind: "ok",
    achievement: dailyAchievementOf({
      date: dateKey,
      today,
      range,
      commits,
      totalCommitsBeforeToday,
      tasks: {
        kind: "tracked",
        endSource: todaySource,
        startSource: yesterdaySource,
        deletedFiles,
        issues,
        historyCommits: history.commits,
        beadsCreatedOn: beadsCreatedOn(issues),
      },
      timeOf: localTimeHHMM,
    }),
  }
}

/**
 * Beads 方式なら `bd` の全件を読む。ファイル方式なら `"files"`。
 * `bd` が失敗・タイムアウトしたら `"unavailable"`。
 */
async function readBeadsIssuesOfStore(
  cwd: string,
  tasks: TaskSettings,
): Promise<readonly BeadsIssue[] | "files" | "unavailable"> {
  if (tasks.store === "files") {
    return "files"
  }
  const beads = await readBeadsIssues(cwd)
  return beads.kind === "issues" ? beads.issues : "unavailable"
}

/** Beads の課題ごとの作った日（タスクID → ローカルの日付キー）。登録日の表に足す。 */
function beadsCreatedOn(issues: readonly BeadsIssue[]): ReadonlyMap<string, string> {
  return new Map(
    issues.map((issue) => [
      taskIdOfBeadsId(issue.id),
      localDateKey(issue.createdAtEpochMilliseconds),
    ]),
  )
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
  cache: AchievementCommitCache,
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
    `--format=${COMMIT_RECORD_SEPARATOR}%H %ct`,
    "--name-only",
  ])
  return result.kind === "output" ? parseCommitLog(result.stdout) : undefined
}

/**
 * 灯りの暦（直近5週ぶん）の日ごとのコミット数を読む。`today` はサーバのローカル時刻の今日。
 *
 * 範囲の日が1日でも覚えていなければ、`git log` を1回だけ起こして範囲全体を数え直し、今日以外を覚える。
 * すべて覚えていれば、今日の分だけを取り直す。
 * `diaryDates` は日記が持つ一覧なので、ここでは常に空を返し、実際の値は配線層が差し替える。
 */
export async function readCommitCalendar(
  cwd: string,
  today: string,
  cache: AchievementCommitCache,
): Promise<ReadCommitCalendarResult> {
  const settings = await readProjectSettings(cwd)
  const head = settings.kind === "read" ? await mainHeadCommit(cwd, settings.tasks) : undefined
  if (head === undefined) {
    return { kind: "ok", calendar: { kind: "unknown" } }
  }

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
    return calendarOf(today, dateKeys, (date) =>
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

  return calendarOf(today, dateKeys, (date) => countsByDate.get(date) ?? 0)
}

function calendarOf(
  today: string,
  dateKeys: readonly string[],
  commitCountOf: (date: string) => number,
): ReadCommitCalendarResult {
  return {
    kind: "ok",
    calendar: {
      kind: "known",
      today,
      days: dateKeys.map((date) => ({ date, commitCount: commitCountOf(date) })),
      diaryDates: [],
    },
  }
}

/** 主ブランチの先端。取れなければ `undefined`（「主ブランチが読めない」）。 */
async function mainHeadCommit(cwd: string, tasks: TaskSettings): Promise<string | undefined> {
  const result = await runGit(cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${mainBranchRefOf(tasks)}^{commit}`,
  ])
  return result.kind === "output" ? result.stdout.trim() : undefined
}

/**
 * `sinceEpochMs` 以降のコミット（`--no-merges`）を、ハッシュ・committer date・変更したファイルの組で読む。
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
    `--format=${COMMIT_RECORD_SEPARATOR}%H %ct`,
    "--name-only",
  ])
  return result.kind === "output" ? parseCommitLog(result.stdout) : undefined
}

/** {@link readCommitsSince} の出力を割る。壊れた1件（見出し行が読めない）はその1件だけ捨てる。 */
function parseCommitLog(output: string): readonly AchievementCommit[] {
  return parseCommitRecords(output, (bodyLines) => ({
    changedFiles: bodyLines.filter((line) => line !== ""),
  }))
}

/**
 * `%H %ct` の見出し行で始まる、{@link COMMIT_RECORD_SEPARATOR} 区切りの記録を割る。
 * 見出し行が読めない1件は捨て、読めた1件には見出し行より後の行から `bodyOf` が作った値を足す。
 */
function parseCommitRecords<Body extends object>(
  output: string,
  bodyOf: (bodyLines: readonly string[]) => Body,
): readonly (Body & { readonly hash: string; readonly committedAtEpochSeconds: number })[] {
  return output.split(COMMIT_RECORD_SEPARATOR).flatMap((record) => {
    if (record === "") {
      return []
    }
    const lines = record.split("\n")
    const header = lines[0]
    const [hash, committedAt] = header === undefined ? [] : header.split(" ")
    const committedAtEpochSeconds = committedAt === undefined ? NaN : Number(committedAt)
    if (hash === undefined || hash === "" || !Number.isInteger(committedAtEpochSeconds)) {
      return []
    }
    return [{ hash, committedAtEpochSeconds, ...bodyOf(lines.slice(1)) }]
  })
}

/** 切り口を探した結果。`empty` は「その時刻より前のコミットが無い」（リポジトリの最初の日）。 */
type CutoffOutcome =
  | { readonly kind: "found"; readonly commit: string }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable" }

/**
 * `epochMs` より前の最新のコミット（`--first-parent`）。
 * 空の出力（そのリポジトリの最初の日）は `empty` で、`git` の失敗とは区別する（前者は「空の集合として比べる」、後者は 503）。
 */
async function cutoffCommitBefore(
  cwd: string,
  head: string,
  epochMs: number,
): Promise<CutoffOutcome> {
  const result = await runGit(cwd, [
    "rev-list",
    "-1",
    "--first-parent",
    `--before=${instantOf(epochMs)}`,
    head,
  ])
  if (result.kind !== "output") {
    return { kind: "unavailable" }
  }
  const commit = result.stdout.trim()
  return commit === "" ? { kind: "empty" } : { kind: "found", commit }
}

/** {@link CutoffOutcome} の `found` / `empty` を、{@link readTaskSnapshotSource} が受け取る形にする。 */
function cutoffCommitOf(outcome: CutoffOutcome): string | undefined {
  return outcome.kind === "found" ? outcome.commit : undefined
}

/**
 * 1つの切り口ぶんのタスクの記録を読む。
 * `cutoff` が `undefined`（切り口が無い＝リポジトリの最初の日）なら `git` を起こさずに空の読み元を返す。
 * 新形式の列挙は1回の `git ls-tree`、中身（新形式のファイル・旧形式・アーカイブ）は1回の `git cat-file --batch` にまとめる。
 */
async function readTaskSnapshotSource(
  cwd: string,
  cutoff: string | undefined,
): Promise<TaskSnapshotSource | "unavailable"> {
  if (cutoff === undefined) {
    return { newFormatFiles: [], oldTasksJson: undefined, archiveMarkdown: undefined }
  }

  const listing = await runGit(cwd, ["ls-tree", "--name-only", cutoff, TASK_DIR_PATH])
  if (listing.kind !== "output") {
    return "unavailable"
  }
  const taskFilePaths = taskFilePathsOf(listing.stdout)

  const batch = await runGitCatFileBatch(cwd, [
    ...taskFilePaths.map((path) => `${cutoff}:${path}`),
    `${cutoff}:${LEGACY_TASKS_PATH}`,
    `${cutoff}:${LEGACY_ARCHIVE_PATH}`,
  ])
  if (batch.kind !== "output") {
    return "unavailable"
  }

  const newFormatFiles = taskFilePaths.flatMap((path, index) => {
    const content = batch.contents[index]
    return content === undefined ? [] : [{ name: basename(path), content }]
  })

  return {
    newFormatFiles,
    oldTasksJson: batch.contents[taskFilePaths.length],
    archiveMarkdown: batch.contents[taskFilePaths.length + 1],
  }
}

/** `git ls-tree --name-only` の出力を、`.md` のパスだけに絞る。 */
function taskFilePathsOf(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.endsWith(".md"))
}

// --- タスクファイルの出入り（登録日・消えたファイル） ---

/**
 * {@link readTaskFileHistory} の結果。
 * `commits` は登録日の表（`taskRegistrationDates`）に渡す形、`deletions` は消える直前の版を読むための一覧。
 */
type TaskFileHistory = {
  readonly commits: readonly TaskFileHistoryCommit[]
  readonly deletions: readonly TaskFileDeletion[]
}

/**
 * 消えた（`D`）タスクファイル1件。
 * `request` は `git cat-file --batch` に渡す `<コミット>^:<パス>`（消したコミットの親の版＝消える直前の版）。
 */
type TaskFileDeletion = {
  readonly id: string
  readonly committedAtEpochSeconds: number
  readonly request: string
}

/**
 * {@link parseTaskFileHistoryLog} の1コミット分。
 * `hash` は消えたファイルの一覧を組み立てるためだけに要り、core へは渡さない（{@link TaskFileHistoryCommit} は持たない）。
 */
type RawTaskFileHistoryCommit = {
  readonly hash: string
  readonly committedAtEpochSeconds: number
  readonly changes: readonly TaskFileChange[]
}

/**
 * タスクファイルと旧形式の一覧の出入りを、`git log --name-status` 1回で読む。
 * `git` が失敗・タイムアウトしたら `undefined`。
 */
async function readTaskFileHistory(
  cwd: string,
  head: string,
): Promise<TaskFileHistory | undefined> {
  const result = await runGit(cwd, [
    "log",
    head,
    "--first-parent",
    `--format=${COMMIT_RECORD_SEPARATOR}%H %ct`,
    "--name-status",
    "--",
    ...TASK_LEDGER_HISTORY_PATHS,
  ])
  if (result.kind !== "output") {
    return undefined
  }

  const rawCommits = parseTaskFileHistoryLog(result.stdout)
  const commits = rawCommits.map((commit) => ({
    committedAtEpochSeconds: commit.committedAtEpochSeconds,
    localDateKey: localDateKey(commit.committedAtEpochSeconds * 1000),
    changes: commit.changes,
  }))
  const deletions = rawCommits.flatMap((commit) =>
    commit.changes.flatMap((change) => {
      if (change.status !== "D") {
        return []
      }
      const id = taskFileIdOfPath(change.path)
      return id === undefined
        ? []
        : [
            {
              id,
              committedAtEpochSeconds: commit.committedAtEpochSeconds,
              request: `${commit.hash}^:${change.path}`,
            },
          ]
    }),
  )
  return { commits, deletions }
}

/** {@link readTaskFileHistory} の出力を割る。壊れた1件（見出し行が読めない）はその1件だけ捨てる。 */
function parseTaskFileHistoryLog(output: string): readonly RawTaskFileHistoryCommit[] {
  return parseCommitRecords(output, (bodyLines) => ({
    changes: bodyLines.flatMap(taskFileChangeOf),
  }))
}

/**
 * `--name-status` の1行（`A\tpath` の形）。リネーム（`R100\told\tnew`）は拾わない。
 * タスクファイルはリネームしない運用で、`old` 側のパスだけ拾っても登録日にも消えたファイルにも使えない。
 */
function taskFileChangeOf(line: string): readonly TaskFileChange[] {
  if (line === "") {
    return []
  }
  const [status, path] = line.split("\t")
  return status === undefined || path === undefined || status.startsWith("R")
    ? []
    : [{ status, path }]
}

/**
 * 消えたファイルの、消える直前の版を1回の `git cat-file --batch` で読む。
 * `git` そのものが失敗・タイムアウトしたときだけ `undefined`。
 * 個々のファイルが読めない（blob が既に無い）だけなら {@link DeletedTaskFile} の `content` が `undefined` になる。
 */
async function readDeletedTaskFiles(
  cwd: string,
  deletions: readonly TaskFileDeletion[],
): Promise<readonly DeletedTaskFile[] | undefined> {
  const batch = await runGitCatFileBatch(
    cwd,
    deletions.map((deletion) => deletion.request),
  )
  if (batch.kind !== "output") {
    return undefined
  }
  return deletions.map((deletion, index) => ({
    id: deletion.id,
    committedAtEpochSeconds: deletion.committedAtEpochSeconds,
    content: batch.contents[index],
  }))
}

/**
 * エポックミリ秒を `git` の `--since` / `--before` に渡す ISO 8601（UTC）にする。
 * 絶対時刻なので、サーバのタイムゾーンに関わらず `git` 側で正しく解釈される。
 */
function instantOf(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString()
}
