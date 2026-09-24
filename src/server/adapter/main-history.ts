// `main` の履歴を読み、成果（`docs/glossary.md`「成果」）を数える境界（docs/design.md 5章
// 「成果の集め方と配り方」）。`git` を起こすのは `./git.ts`（`task-summary.ts` と共有する口）、
// 数える判断は `../core/achievement.ts`、日付キーから始まり・終わりを出すのは `./local-time.ts`。
//
// **読むのは作業ツリーのファイルではなく `main` の上のもの**（`task-summary.ts` と同じ理由。
// 正典は `main` のもので、作業ツリーのものは `git merge main` するまで別の作業ツリーの分を
// 知らない）。
//
// **`main` が読めない**（git リポジトリでない・`main` ブランチが無い・`git` が無い）ときは
// {@link DailyAchievement} の `{ kind: "unknown" }`（呼び出し側は 200 のまま配ってよい）。
// それ以外の `git` の呼び出し（コミットの列挙・切り口・タスクの記録の読み取り）が**タイムアウト・
// 失敗したときは {@link ReadAchievementResult} の `{ kind: "unavailable" }`**——こちらは
// 呼び出し側（`server.ts`）が 503 にする（部分的な数を出さない。docs/design.md 5章）。

import { basename } from "node:path"

import { type DailyAchievement } from "../../shared/achievement.ts"
import {
  countAchievementCommits,
  doneTasksSince,
  doneTaskSummaries,
  hasTaskTracking,
  type AchievementCommit,
  type TaskSnapshotSource,
} from "../core/achievement.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"
import { localDateEpochRange } from "./local-time.ts"

/** 完全な参照名で指す（`task-summary.ts` と同じ理由）。 */
const MAIN_BRANCH_REF = "refs/heads/main"

const TASKS_FILE_PATH = "develop/tasks.json"
const ARCHIVE_FILE_PATH = "docs/history/tasks.md"

/** 末尾の `/` を付けて `git ls-tree` に渡すと、そのディレクトリ自身の1行ではなく直下の一覧になる。 */
const TASK_DIR_PATH = "develop/task/"

/** `git log --since` に持たせる余裕（`docs/design.md` 5章「**--since に7日の余裕を持たせる**」）。 */
const SINCE_MARGIN_DAYS = 7
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** `git log` の1件を区切る印（ファイル名に出てこない前提）。**NUL（`\x00`）は使えない**——
 * `node:child_process` の `execFile` は引数に NUL を含む文字列を渡すと例外を投げる。代わりに
 * ASCII の record separator（`\x1e`）を使う。 */
const COMMIT_RECORD_SEPARATOR = "\x1e"

/** {@link readAchievement} の結果。`unavailable` は一時的な失敗（`git` のタイムアウト・失敗）で、
 * 呼び出し側が 503 にする。「`main` が読めない」は `unavailable` ではなく
 * `{ kind: "ok", achievement: { kind: "unknown" } }`（冒頭のコメント）。 */
export type ReadAchievementResult =
  | { readonly kind: "ok"; readonly achievement: DailyAchievement }
  | { readonly kind: "unavailable" }

/**
 * 成果を1日ぶん読む。`dateKey` は見る日、`today` はサーバのローカル時刻の今日
 * （どちらも呼び出し側が検証済みの `YYYY-MM-DD`。`resolveAchievementDateKey` の戻り値）。
 */
export async function readAchievement(
  cwd: string,
  dateKey: string,
  today: string,
): Promise<ReadAchievementResult> {
  const head = await mainHeadCommit(cwd)
  if (head === undefined) {
    return { kind: "ok", achievement: { kind: "unknown" } }
  }

  const range = localDateEpochRange(dateKey)

  const commits = await readCommitsSince(
    cwd,
    head,
    range.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
  )
  if (commits === undefined) {
    return { kind: "unavailable" }
  }
  const commitCount = countAchievementCommits(
    commits,
    epochSecondsOf(range.startEpochMilliseconds),
    epochSecondsOf(range.endEpochMilliseconds),
  )

  const headSource = await readTaskSnapshotSource(cwd, head)
  if (headSource === "unavailable") {
    return { kind: "unavailable" }
  }
  if (!hasTaskTracking(headSource)) {
    return {
      kind: "ok",
      achievement: {
        kind: "known",
        date: dateKey,
        today,
        commitCount,
        doneTasks: { kind: "unknown" },
      },
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

  const items = doneTasksSince(doneTaskSummaries(todaySource), doneTaskSummaries(yesterdaySource))

  return {
    kind: "ok",
    achievement: {
      kind: "known",
      date: dateKey,
      today,
      commitCount,
      doneTasks: { kind: "known", items },
    },
  }
}

/** `main` の先端。取れなければ `undefined`（「`main` が読めない」。冒頭のコメント）。 */
async function mainHeadCommit(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${MAIN_BRANCH_REF}^{commit}`,
  ])
  return result.kind === "output" ? result.stdout.trim() : undefined
}

/**
 * `sinceEpochMs` 以降のコミット（`--no-merges`）を、ハッシュ・committer date・変更したファイルの
 * 組で読む。`git` が失敗・タイムアウトしたら `undefined`。
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
    return [
      {
        hash,
        committedAtEpochSeconds,
        changedFiles: lines.slice(1).filter((line) => line !== ""),
      },
    ]
  })
}

/** 切り口を探した結果。`empty` は「その時刻より前のコミットが無い」（リポジトリの最初の日）。 */
type CutoffOutcome =
  | { readonly kind: "found"; readonly commit: string }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable" }

/**
 * `epochMs` より前の最新のコミット（`--first-parent`。docs/design.md 5章「切り口」）。
 * 空の出力（そのリポジトリの最初の日）は `empty`——`git` の失敗とは区別する
 * （前者は「空の集合として比べる」、後者は 503）。
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
 * 1つの切り口ぶんのタスクの記録を読む。`cutoff` が `undefined`（切り口が無い＝リポジトリの
 * 最初の日）なら `git` を起こさずに空の読み元を返す。**新形式の列挙は1回の `git ls-tree`、
 * 中身（新形式のファイル・旧形式・アーカイブ）は1回の `git cat-file --batch`** にまとめる
 * （`task-summary.ts` の `readTasksAtHead` と同じやり方）。
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
    `${cutoff}:${TASKS_FILE_PATH}`,
    `${cutoff}:${ARCHIVE_FILE_PATH}`,
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

/** `git ls-tree --name-only` の出力を、`.md` のパスだけに絞る（`task-summary.ts` と同じ）。 */
function taskFilePathsOf(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.endsWith(".md"))
}

/** エポックミリ秒を `git` の `--since` / `--before` に渡す ISO 8601（UTC）にする。絶対時刻なので
 * サーバのタイムゾーンに関わらず `git` 側で正しく解釈される。 */
function instantOf(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString()
}

function epochSecondsOf(epochMs: number): number {
  return Math.floor(epochMs / 1000)
}
