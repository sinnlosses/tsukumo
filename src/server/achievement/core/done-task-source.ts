// 終えたタスクの読み元（新形式・旧形式・アーカイブ）を解釈し、切り口どうしの差とタスクの節目を数える判断だけを持つ。
// ファイル I/O も `git` も触らない純関数で、読み元を集めるのは呼び出し側。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはタスクの ID・summary だけ。

import type { AchievementMilestone } from "../../../shared/achievement/achievement.ts"
import { legacyDoneTaskSummaries } from "../../../shared/repository/task-file-ledger.ts"
import { parseNewTaskFile } from "../../../shared/repository/task-summary.ts"

/** タスクの記録を読むための3つの読み元（呼び出し側が1つの切り口ぶん集めたもの）。 */
export type TaskSnapshotSource = {
  /** 新形式のタスクファイル。ファイル名と中身の組。 */
  readonly newFormatFiles: readonly { readonly name: string; readonly content: string }[]
  /** 旧形式の一覧。無ければ `undefined`（その切り口に無い）。 */
  readonly oldTasksJson: string | undefined
  /** 旧形式のアーカイブ。無ければ `undefined`。 */
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

  return unionDoneTaskSummaries(
    doneTasks,
    legacyDoneTaskSummaries(source.oldTasksJson, source.archiveMarkdown),
  )
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
