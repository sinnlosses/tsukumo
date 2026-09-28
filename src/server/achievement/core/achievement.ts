// 成果を数える判断だけを持つ。ファイル I/O も `git` も触らない純関数で、`main` の上から実際に読むのは呼び出し側。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはコミットの数とタスクの ID・summary だけ。

import { isPlainObject, prop, sortBy } from "remeda"

import type {
  AchievementGraduation,
  AchievementMilestone,
} from "../../../shared/achievement/achievement.ts"
import { parseNewTaskFile } from "../../../shared/repository/task-summary.ts"

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
      !commit.changedFiles.every(isLedgerPath),
  )
}

/** タスクの記録を読むための3つの読み元（呼び出し側が1つの切り口ぶん集めたもの）。 */
export type TaskSnapshotSource = {
  /** 新形式（`develop/task/*.md`）。ファイル名と中身の組。 */
  readonly newFormatFiles: readonly { readonly name: string; readonly content: string }[]
  /** 旧形式（`develop/tasks.json`）。無ければ `undefined`（その切り口に無い）。 */
  readonly oldTasksJson: string | undefined
  /** アーカイブ（`docs/history/tasks.md`）。無ければ `undefined`。 */
  readonly archiveMarkdown: string | undefined
}

/**
 * `main` の先端 H の時点でタスクの記録があるか。H の切り口を渡し、`false` なら応答の `doneTasks` を `unknown` にする。
 * 個々の日の切り口には渡さない。日の切り口に読み元が無いのは「その日はまだ0件」であって「記録が無い」ではない。
 */
export function hasTaskTracking(source: TaskSnapshotSource): boolean {
  return (
    source.newFormatFiles.length > 0 ||
    source.oldTasksJson !== undefined ||
    source.archiveMarkdown !== undefined
  )
}

/**
 * 切り口ぶんの読み元から `done` の ID → summary を組み立てる。
 * 優先順は新形式 → 旧形式 → アーカイブで、同じ ID が複数の読み元にあっても先に見つかったものを残す。
 * 読み元がどれも無くても空を返す（「記録が無い」の判定は {@link hasTaskTracking} が別に持つ）。
 */
export function doneTaskSummaries(source: TaskSnapshotSource): ReadonlyMap<string, string> {
  const doneTasks = new Map<string, string>()

  for (const file of source.newFormatFiles) {
    const task = parseNewTaskFile(file.name, file.content)
    if (task !== undefined && task.status === "done") {
      doneTasks.set(task.id, task.summary)
    }
  }

  if (source.oldTasksJson !== undefined) {
    for (const task of oldFormatDoneTasksOf(source.oldTasksJson)) {
      if (!doneTasks.has(task.id)) {
        doneTasks.set(task.id, task.summary)
      }
    }
  }

  if (source.archiveMarkdown !== undefined) {
    for (const task of archivedDoneTasksOf(source.archiveMarkdown)) {
      if (!doneTasks.has(task.id)) {
        doneTasks.set(task.id, task.summary)
      }
    }
  }

  return doneTasks
}

/** {@link doneTasksSince} が返す1件。 */
export type TaskSummaryDiffItem = { readonly id: string; readonly summary: string }

/**
 * 2つの切り口の `done` の差を取る。前の日の切り口には無かった（またはまだ `done` でなかった）
 * ID だけを、当日の切り口の順のまま返す。
 */
export function doneTasksSince(
  today: ReadonlyMap<string, string>,
  yesterday: ReadonlyMap<string, string>,
): readonly TaskSummaryDiffItem[] {
  return [...today].flatMap(([id, summary]) => (yesterday.has(id) ? [] : [{ id, summary }]))
}

/** 2つの読み元の `done` の ID → summary を足し合わせる。同じ ID があれば先（`a`）を残す。 */
export function unionDoneTaskSummaries(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const merged = new Map(a)
  for (const [id, summary] of b) {
    if (!merged.has(id)) {
      merged.set(id, summary)
    }
  }
  return merged
}

// --- タスクファイルの出入り（登録日・消えたファイル） ---

/** `develop/task/T-xxx.md` のパスから ID を取る。当てはまらなければ `undefined`。 */
const TASK_FILE_PATH_PATTERN = /^develop\/task\/(T-\d{3,})\.md$/

/** `develop/task/T-xxx.md` のパスから ID を取る（{@link TASK_FILE_PATH_PATTERN}）。 */
export function taskFileIdOfPath(path: string): string | undefined {
  return TASK_FILE_PATH_PATTERN.exec(path)?.[1]
}

/**
 * `git log --name-status` の1行（`A\tdevelop/task/T-xxx.md` の形）。
 * R（リネーム）は扱わない（タスクファイルはリネームしない運用のため）。
 */
export type TaskFileChange = { readonly status: string; readonly path: string }

/**
 * `git log H --first-parent --name-status -- develop/task/ develop/tasks.json` の1コミット分。
 * `localDateKey` は committer date をローカルの日付に直したもの。
 */
export type TaskFileHistoryCommit = {
  readonly committedAtEpochSeconds: number
  readonly localDateKey: string
  readonly changes: readonly TaskFileChange[]
}

/**
 * タスクごとの登録日の表。git のタスクファイルは最古の `A` のコミットの日付。
 * `develop/tasks.json` の `D` を含むコミット（形式の切り替え）で入ったファイルは表に入れない（旧形式で登録したタスクとみなす）。
 *
 * `beadsCreatedOn`（Beads の課題の作った日。ファイル方式なら空）は、git のタスクファイルとして一度も現れなかった ID にだけ使う。
 * Beads へ移した課題の作った日は移した日で、登録日ではないため。
 */
export function taskRegistrationDates(
  commits: readonly TaskFileHistoryCommit[],
  beadsCreatedOn: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const registeredOn = new Map<string, string>()
  const seenInGit = new Set(
    commits.flatMap((commit) =>
      commit.changes.flatMap((change) => {
        const id = taskFileIdOfPath(change.path)
        return id === undefined ? [] : [id]
      }),
    ),
  )
  for (const [id, createdOn] of beadsCreatedOn) {
    if (!seenInGit.has(id)) {
      registeredOn.set(id, createdOn)
    }
  }

  for (const commit of commits) {
    const isFormatSwitch = commit.changes.some(
      (change) => change.status === "D" && change.path === "develop/tasks.json",
    )
    if (isFormatSwitch) {
      continue
    }
    for (const change of commit.changes) {
      if (change.status !== "A") {
        continue
      }
      const id = taskFileIdOfPath(change.path)
      if (id === undefined) {
        continue
      }
      const existing = registeredOn.get(id)
      if (existing === undefined || commit.localDateKey < existing) {
        registeredOn.set(id, commit.localDateKey)
      }
    }
  }

  return registeredOn
}

/**
 * `develop/task/` から消えた（剪定された）ファイル1件。
 * `content` は消したコミットの親の版（`<コミット>^:<パス>`）で、読めなかったときは `undefined`。
 */
export type DeletedTaskFile = {
  readonly id: string
  readonly committedAtEpochSeconds: number
  readonly content: string | undefined
}

/**
 * 消えたファイルのうち、`beforeEpochSeconds` より前に消え、消える直前の版が `status: done` のものを id → summary で返す。
 * 切り口（{@link doneTaskSummaries}）の結果と足し合わせて使わないと、その日のうちに消されたタスクが終えたタスクからも通算の数からも漏れる。
 */
export function deletedDoneTaskSummariesBefore(
  deletedFiles: readonly DeletedTaskFile[],
  beforeEpochSeconds: number,
): ReadonlyMap<string, string> {
  const summaries = new Map<string, string>()
  for (const file of deletedFiles) {
    if (file.committedAtEpochSeconds >= beforeEpochSeconds || file.content === undefined) {
      continue
    }
    const task = parseNewTaskFile(`${file.id}.md`, file.content)
    if (task !== undefined && task.status === "done") {
      summaries.set(file.id, task.summary)
    }
  }
  return summaries
}

// --- 卒業と節目。区切りの値は仮の値で、使いながら直す。---

/** 卒業とみなす、登録からの日数の下限（仮）。 */
export const GRADUATION_MIN_DAYS = 7

/** タスクの節目の刻み（仮）。 */
export const TASK_MILESTONE_STEP = 250

/** コミットの節目の刻み（仮）。 */
export const COMMIT_MILESTONE_STEP = 1000

/**
 * その日に終えたタスクのうち、登録から {@link GRADUATION_MIN_DAYS} 日以上経っていたものを、登録の古い順で返す。
 * 登録日が無い（旧形式や形式切り替えで登録した）タスクは対象にしない。
 * `endedOn` はその日の日付キー（終えた日）。
 */
export function graduationsOf(
  items: readonly TaskSummaryDiffItem[],
  registeredOnById: ReadonlyMap<string, string>,
  endedOn: string,
): readonly AchievementGraduation[] {
  const endedOnDate = Temporal.PlainDate.from(endedOn)
  const graduations = items.flatMap((item) => {
    const registeredOn = registeredOnById.get(item.id)
    if (registeredOn === undefined) {
      return []
    }
    const days = endedOnDate.since(Temporal.PlainDate.from(registeredOn), {
      largestUnit: "day",
    }).days
    return days >= GRADUATION_MIN_DAYS
      ? [{ id: item.id, summary: item.summary, registeredOn, days }]
      : []
  })
  return sortBy(graduations, prop("registeredOn"))
}

/** `T-NNN`・`GH-NNN` の数の部分（`NNN`）。並び替えだけに使い、桁が読めなければ並びの最後に落とす。 */
function taskIdNumber(id: string): number {
  const match = /^(?:T|GH)-(\d+)$/.exec(id)
  const digits = match?.[1]
  return digits === undefined ? Number.POSITIVE_INFINITY : Number(digits)
}

/**
 * タスクの節目。その日に終えたタスクを ID の順に、前の日の終わりまでの通算の数（`totalBeforeToday`）に足していき、{@link TASK_MILESTONE_STEP} の倍数に届いたものを返す。
 * 1日に複数の刻みをまたいだら、大きいほう（最後に届いたもの）だけを返す。
 */
export function taskMilestoneOf(
  items: readonly TaskSummaryDiffItem[],
  totalBeforeToday: number,
): AchievementMilestone | undefined {
  const sorted = [...items].sort((a, b) => taskIdNumber(a.id) - taskIdNumber(b.id))
  let running = totalBeforeToday
  let crossed: { readonly count: number; readonly taskId: string } | undefined
  for (const item of sorted) {
    running += 1
    if (running % TASK_MILESTONE_STEP === 0) {
      crossed = { count: running, taskId: item.id }
    }
  }
  return crossed === undefined
    ? undefined
    : { kind: "task", count: crossed.count, taskId: crossed.taskId }
}

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

// --- 灯りの暦 ---

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
    if (commit.changedFiles.every(isLedgerPath)) {
      continue
    }
    counts.set(commit.localDateKey, (counts.get(commit.localDateKey) ?? 0) + 1)
  }
  return counts
}

/** コミットの数から外すファイル（運用の帳面）。 */
function isLedgerPath(path: string): boolean {
  return (
    path === "develop/tasks.json" ||
    path === "develop/progress.md" ||
    path.startsWith("develop/task/") ||
    path === "docs/history/tasks.md" ||
    path === "docs/history/progress.md"
  )
}

// --- 旧形式（develop/tasks.json）。過去の切り口にだけ現れる。passes まで読む。 ---

type OldFormatDoneTask = { readonly id: string; readonly summary: string }

function oldFormatDoneTasksOf(content: string): readonly OldFormatDoneTask[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.flatMap((task) => oldFormatDoneTaskOf(task))
}

function oldFormatDoneTaskOf(task: unknown): readonly OldFormatDoneTask[] {
  if (!isPlainObject(task) || typeof task.id !== "string") {
    return []
  }
  if (task.status !== "done" || task.passes !== true) {
    return []
  }
  const summary =
    typeof task.summary === "string" && task.summary !== "" ? task.summary : firstLineOf(task.task)
  return summary === undefined ? [] : [{ id: task.id, summary }]
}

function firstLineOf(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined
  }
  return value.split("\n")[0]
}

// --- アーカイブ（docs/history/tasks.md）。 ---

/** 節の見出し（`## T-XXX <名前>` または名前無しの `## T-XXX`）。 */
const ARCHIVE_HEADING_PATTERN = /^## (T-\d{3,})[ \t]*(.*)$/
/** `passes:` の値。バックティック付き／無し、大文字小文字、`yes` の揺れをすべて拾う（`docs/history/tasks.md` に実際に出てくる形）。 */
const ARCHIVE_PASSES_PATTERN = /\*\*passes\*\*:\s*`?([A-Za-z]+)`?/
/** 見出しに名前が無い古い節が使う「タスク: <summary>」行。 */
const ARCHIVE_TASK_LINE_PATTERN = /^\*\*タスク\*\*:\s*(.+)$/m
const ARCHIVE_PASSING_VALUES = new Set(["true", "yes"])

/**
 * `docs/history/tasks.md` から `done`（`passes` が真）の節だけを拾う。
 * 節の境界は次の見出し（`## T-XXX`）なので、本文の中に別の `passes:` らしき文字列があっても後の節の値を誤って拾わない。
 * 壊れた・読めない節はその1件だけ読み飛ばす。
 */
function archivedDoneTasksOf(content: string): readonly OldFormatDoneTask[] {
  const sections = content.split(/\n(?=## T-\d{3,})/)
  return sections.flatMap((section) => archivedDoneTaskOfSection(section))
}

function archivedDoneTaskOfSection(section: string): readonly OldFormatDoneTask[] {
  const headingLine = section.split("\n", 1)[0] ?? ""
  const heading = ARCHIVE_HEADING_PATTERN.exec(headingLine)
  if (heading === null) {
    return []
  }
  const id = heading[1]
  if (id === undefined) {
    return []
  }

  const passesMatch = ARCHIVE_PASSES_PATTERN.exec(section)
  const passesValue = passesMatch?.[1]?.toLowerCase()
  if (passesValue === undefined || !ARCHIVE_PASSING_VALUES.has(passesValue)) {
    return []
  }

  const titleFromHeading = heading[2]?.trim()
  const summary =
    titleFromHeading !== undefined && titleFromHeading !== ""
      ? titleFromHeading
      : ARCHIVE_TASK_LINE_PATTERN.exec(section)?.[1]?.trim()

  return summary === undefined || summary === "" ? [] : [{ id, summary }]
}
