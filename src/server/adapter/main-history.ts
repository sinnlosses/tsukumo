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

import { type AchievementMilestone, type DailyAchievement } from "../../shared/achievement.ts"
import {
  achievementCommitsInRange,
  commitMilestoneOf,
  countAchievementCommits,
  deletedDoneTaskSummariesBefore,
  doneTasksSince,
  doneTaskSummaries,
  graduationsOf,
  hasTaskTracking,
  taskFileIdOfPath,
  taskMilestoneOf,
  taskRegistrationDates,
  unionDoneTaskSummaries,
  type AchievementCommit,
  type DeletedTaskFile,
  type TaskFileChange,
  type TaskFileHistoryCommit,
  type TaskSnapshotSource,
} from "../core/achievement.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"
import { localDateEpochRange, localDateKey, localTimeHHMM } from "./local-time.ts"

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
  const startEpochSeconds = epochSecondsOf(range.startEpochMilliseconds)
  const endEpochSeconds = epochSecondsOf(range.endEpochMilliseconds)

  const commits = await readCommitsSince(
    cwd,
    head,
    range.startEpochMilliseconds - SINCE_MARGIN_DAYS * MILLISECONDS_PER_DAY,
  )
  if (commits === undefined) {
    return { kind: "unavailable" }
  }
  const commitCount = countAchievementCommits(commits, startEpochSeconds, endEpochSeconds)

  // 節目（コミットの節目）は、タスクの記録の有無に関わらず出す（`docs/requirements.md`
  // 4.11「タスクの記録が無いリポジトリでは、卒業とタスクの節目は出さない（コミットの節目は
  // 出す）」）。通算の数は履歴の頭から end までの1回の `git log` で数える。
  const allCommitsUntilEnd = await readAllCommitsUntil(cwd, head, range.endEpochMilliseconds)
  if (allCommitsUntilEnd === undefined) {
    return { kind: "unavailable" }
  }
  const totalCommitsBeforeToday = countAchievementCommits(allCommitsUntilEnd, 0, startEpochSeconds)
  const todaysCommitEpochSeconds = achievementCommitsInRange(
    commits,
    startEpochSeconds,
    endEpochSeconds,
  ).map((commit) => commit.committedAtEpochSeconds)
  const commitMilestone = commitMilestoneOfDay(todaysCommitEpochSeconds, totalCommitsBeforeToday)

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
        graduations: [],
        milestones: commitMilestone === undefined ? [] : [commitMilestone],
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

  // タスクファイルの出入り（登録日・消えたファイル）。
  const history = await readTaskFileHistory(cwd, head)
  if (history === undefined) {
    return { kind: "unavailable" }
  }
  const deletedFiles = await readDeletedTaskFiles(cwd, history.deletions)
  if (deletedFiles === undefined) {
    return { kind: "unavailable" }
  }
  const registeredOnById = taskRegistrationDates(history.commits)

  const endUnion = unionDoneTaskSummaries(
    doneTaskSummaries(todaySource),
    deletedDoneTaskSummariesBefore(deletedFiles, endEpochSeconds),
  )
  const startUnion = unionDoneTaskSummaries(
    doneTaskSummaries(yesterdaySource),
    deletedDoneTaskSummariesBefore(deletedFiles, startEpochSeconds),
  )
  const items = doneTasksSince(endUnion, startUnion)
  const graduations = graduationsOf(items, registeredOnById, dateKey)
  const taskMilestone = taskMilestoneOf(items, startUnion.size)
  const milestones = [taskMilestone, commitMilestone].filter(
    (milestone): milestone is AchievementMilestone => milestone !== undefined,
  )

  return {
    kind: "ok",
    achievement: {
      kind: "known",
      date: dateKey,
      today,
      commitCount,
      doneTasks: { kind: "known", items },
      graduations,
      milestones,
    },
  }
}

/** {@link commitMilestoneOf} の結果を {@link AchievementMilestone} の形にする（時刻は
 * `local-time.ts` で組み立てる）。 */
function commitMilestoneOfDay(
  todaysCommitEpochSeconds: readonly number[],
  totalCommitsBeforeToday: number,
): AchievementMilestone | undefined {
  const crossed = commitMilestoneOf(todaysCommitEpochSeconds, totalCommitsBeforeToday)
  return crossed === undefined
    ? undefined
    : {
        kind: "commit",
        count: crossed.count,
        time: localTimeHHMM(crossed.committedAtEpochSeconds * 1000),
      }
}

/**
 * 履歴の頭から `untilEpochMs` までの全コミット（`--no-merges`、`git log --until`）。
 * 通算のコミットの数（節目）を数えるのに使う。**まだ覚えない**——今日以外の日の数を覚える
 * 入れ物は暦と共有する形で足す（`docs/design.md`「成果の集め方と配り方」手順7）。それまでは
 * 1回の応答ごとに数え直す（同じ日は同じ値になる）。
 */
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

// --- タスクファイルの出入り（登録日・消えたファイル） ---

/** {@link readTaskFileHistory} の結果。`commits` は登録日の表（`taskRegistrationDates`）が使う形、
 * `deletions` は {@link readDeletedTaskFiles} が消える直前の版を読むのに使う一覧。 */
type TaskFileHistory = {
  readonly commits: readonly TaskFileHistoryCommit[]
  readonly deletions: readonly TaskFileDeletion[]
}

/** 消えた（`D`）タスクファイル1件。`request` は `git cat-file --batch` に渡す `<コミット>^:<パス>`
 * （消したコミットの親の版＝消える直前の版）。 */
type TaskFileDeletion = {
  readonly id: string
  readonly committedAtEpochSeconds: number
  readonly request: string
}

/** {@link parseTaskFileHistoryLog} の1コミット分。`hash` は消えたファイルの一覧を組み立てる
 * ためだけに要り、core へは渡さない（core の {@link TaskFileHistoryCommit} は持たない）。 */
type RawTaskFileHistoryCommit = {
  readonly hash: string
  readonly committedAtEpochSeconds: number
  readonly changes: readonly TaskFileChange[]
}

/**
 * `develop/task/` と `develop/tasks.json` の出入りを、`git log --name-status` 1回で読む
 * （`docs/design.md`「成果の集め方と配り方」「タスクファイルの出入り」）。`git` が失敗・タイムアウトしたら `undefined`。
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
    TASK_DIR_PATH,
    TASKS_FILE_PATH,
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

/** {@link readTaskFileHistory} の出力を割る。壊れた1件（見出し行が読めない）はその1件だけ捨てる
 * （{@link parseCommitLog} と同じ形）。 */
function parseTaskFileHistoryLog(output: string): readonly RawTaskFileHistoryCommit[] {
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
    return [{ hash, committedAtEpochSeconds, changes: lines.slice(1).flatMap(taskFileChangeOf) }]
  })
}

/** `--name-status` の1行（`A\tpath` の形）。**リネーム（`R100\told\tnew`）は拾わない**——タスク
 * ファイルはリネームしない運用で、`old` 側のパスだけ拾っても登録日にも消えたファイルにも使えない。 */
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
 * **`git` そのものが失敗・タイムアウトしたときだけ `undefined`**——個々のファイルが読めない
 * （blob が既に無い）だけなら {@link DeletedTaskFile} の `content` が `undefined` になり、
 * 呼び出し側（`deletedDoneTaskSummariesBefore`）がその1件だけ読み飛ばす。
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

/** エポックミリ秒を `git` の `--since` / `--before` に渡す ISO 8601（UTC）にする。絶対時刻なので
 * サーバのタイムゾーンに関わらず `git` 側で正しく解釈される。 */
function instantOf(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString()
}

function epochSecondsOf(epochMs: number): number {
  return Math.floor(epochMs / 1000)
}
