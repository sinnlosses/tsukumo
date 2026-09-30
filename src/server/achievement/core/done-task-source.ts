// 終えたタスクの読み元（新形式・旧形式・アーカイブ）を解釈し、切り口どうしの差とタスクの節目を数える判断だけを持つ。
// ファイル I/O も `git` も触らない純関数で、読み元を集めるのは呼び出し側。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはタスクの ID・summary だけ。

import { isPlainObject } from "remeda"

import type { AchievementMilestone } from "../../../shared/achievement/achievement.ts"
import { parseNewTaskFile } from "../../../shared/repository/task-summary.ts"

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

/** タスクの節目の刻み（仮）。 */
export const TASK_MILESTONE_STEP = 250

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
