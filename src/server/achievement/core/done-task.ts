// 終えたタスクの、2つの時刻のあいだの差とタスクの節目を数える判断だけを持つ。
// ファイル I/O も `bd` も触らない純関数。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはタスクの ID・summary だけ。

import type { AchievementMilestone } from "../../../shared/achievement/achievement.ts"

/** {@link doneTasksSince} が返す1件。 */
export type TaskSummaryDiffItem = { readonly id: string; readonly summary: string }

/**
 * 2つの時点の終えたタスクの差を取る。前の時点には無かった ID だけを、後の時点の順のまま返す。
 */
export function doneTasksSince(
  today: ReadonlyMap<string, string>,
  yesterday: ReadonlyMap<string, string>,
): readonly TaskSummaryDiffItem[] {
  return [...today].flatMap(([id, summary]) => (yesterday.has(id) ? [] : [{ id, summary }]))
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
