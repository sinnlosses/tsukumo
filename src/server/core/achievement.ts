// 成果（`docs/glossary.md`「成果」）を数える判断だけを持つ。**ファイルI/O も `git` も触らない
// 純関数**（`docs/design.md` 5章「成果の集め方と配り方」）——`main` の上から実際に読むのは
// `src/server/adapter/main-history.ts` で、ここはその結果を渡されて数える。
//
// 数え方の規則は `docs/requirements.md` 4.11 が正典。ここが持つのは:
// - **運用の帳面**のパスの判定（コミットの数から外すファイル）
// - `git log` から読んだコミットの並びを、日の範囲と運用の帳面で絞ってコミット数にする
// - `main` の先端 H にタスクの記録があるか（{@link hasTaskTracking}。無ければ応答全体の
//   `doneTasks` を `unknown` にする）
// - 日ごとの切り口（`main-history.ts` が `git` で取ったスナップショット）の中身から、
//   `done` のタスクの ID と `summary` を集める（{@link doneTaskSummaries}。新形式・旧形式・
//   アーカイブの3つの読み元。旧形式は `passes` まで読む——`src/shared/task-summary.ts` の
//   `readTaskSummaries` は `passes` を持たないので、ここで別に読む）
// - 2つの切り口の差（前の日には無かった `done`）を取る（{@link doneTasksSince}）
//
// **会話の文面は扱わない**——運ぶのはコミットの数とタスクの ID・summary だけ
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { isPlainObject } from "remeda"

import { parseNewTaskFile } from "../../shared/task-summary.ts"

/** `git log` から読んだコミット1件（`main-history.ts` が `--name-only` の出力を割ったもの）。 */
export type AchievementCommit = {
  readonly hash: string
  /** committer date（`%ct`）。エポック秒（`git log` の単位のまま。ミリ秒に直さない）。 */
  readonly committedAtEpochSeconds: number
  readonly changedFiles: readonly string[]
}

/**
 * `[startEpochSeconds, endEpochSeconds)` に committer date が入り、**変更したファイルが
 * すべて運用の帳面のものではない**コミットだけを数える。`git log --no-merges` で merge
 * commit は既に除かれている前提（`main-history.ts` が渡す前に絞る）。
 *
 * 変更ファイルが0件（空コミット）は「すべて帳面」に含めて外す——空コミットは成果として
 * 数える理由が無い。
 */
export function countAchievementCommits(
  commits: readonly AchievementCommit[],
  startEpochSeconds: number,
  endEpochSeconds: number,
): number {
  return commits.filter(
    (commit) =>
      commit.committedAtEpochSeconds >= startEpochSeconds &&
      commit.committedAtEpochSeconds < endEpochSeconds &&
      !commit.changedFiles.every(isLedgerPath),
  ).length
}

/** タスクの記録を読むための3つの読み元（`main-history.ts` が1つの切り口ぶん集めたもの）。 */
export type TaskSnapshotSource = {
  /** 新形式（`develop/task/*.md`）。ファイル名と中身の組。 */
  readonly newFormatFiles: readonly { readonly name: string; readonly content: string }[]
  /** 旧形式（`develop/tasks.json`）。無ければ `undefined`（その切り口に無い）。 */
  readonly oldTasksJson: string | undefined
  /** アーカイブ（`docs/history/tasks.md`）。無ければ `undefined`。 */
  readonly archiveMarkdown: string | undefined
}

/**
 * `main` の先端 H の時点でタスクの記録があるか。**これで一度だけ決める**——個々の日の切り口に
 * 読み元が無いのは「その日はまだ0件」であって「記録が無い」ではない（`docs/requirements.md`
 * 4.11「タスクの記録がどちらの形式も無いリポジトリ…」）。呼び出し側（`main-history.ts`）が
 * H の切り口をここに渡して、`false` なら応答の `doneTasks` を `unknown` にする。
 */
export function hasTaskTracking(source: TaskSnapshotSource): boolean {
  return (
    source.newFormatFiles.length > 0 ||
    source.oldTasksJson !== undefined ||
    source.archiveMarkdown !== undefined
  )
}

/**
 * 切り口ぶんの読み元から `done` の ID → summary を組み立てる。**優先順は新形式 → 旧形式 →
 * アーカイブ**（同じ ID が複数の読み元にあっても先に見つかったものを残す。
 * `docs/requirements.md` 4.11「画面と依頼に出す summary は…」）。**読み元がどれも無くても
 * 空の並びを返す**（「その日はまだ0件」。「記録が無い」の判定は {@link hasTaskTracking} が
 * 別に持つ）。
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
 * 2つの切り口の `done` の差を取る。**前の日の切り口には無かった（またはまだ `done` でなかった）
 * ID だけ**を、当日の切り口の順のまま返す。
 */
export function doneTasksSince(
  today: ReadonlyMap<string, string>,
  yesterday: ReadonlyMap<string, string>,
): readonly TaskSummaryDiffItem[] {
  return [...today].flatMap(([id, summary]) => (yesterday.has(id) ? [] : [{ id, summary }]))
}

/** コミットの数から外すファイル（`docs/requirements.md` 4.11「運用の帳面」）。 */
function isLedgerPath(path: string): boolean {
  return (
    path === "develop/tasks.json" ||
    path === "develop/progress.md" ||
    path.startsWith("develop/task/") ||
    path === "docs/history/tasks.md" ||
    path === "docs/history/progress.md"
  )
}

// --- 旧形式（develop/tasks.json）。passes まで読む（shared の readTaskSummaries は持たない）。 ---

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
/** `**passes**:` の値。バックティック付き／無し、大文字小文字、`yes` の揺れをすべて拾う
 * （実際のアーカイブに出てくる形。`docs/history/tasks.md` を参照）。 */
const ARCHIVE_PASSES_PATTERN = /\*\*passes\*\*:\s*`?([A-Za-z]+)`?/
/** 見出しに名前が無い古い節が使う「**タスク**: <summary>」行。 */
const ARCHIVE_TASK_LINE_PATTERN = /^\*\*タスク\*\*:\s*(.+)$/m
const ARCHIVE_PASSING_VALUES = new Set(["true", "yes"])

/**
 * `docs/history/tasks.md` から `done`（`passes` が真）の節だけを拾う。**節の境界は次の見出し**
 * （`## T-XXX`）なので、本文の中に別の `**passes**:` らしき文字列があっても後の節の値を
 * 誤って拾わない。**壊れた・読めない節はその1件だけ読み飛ばす**（他の要素と同じ安全側の判断）。
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
