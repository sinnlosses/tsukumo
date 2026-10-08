// 読み終えた Beads の閉じた課題から、1日ぶんの成果（`DailyAchievement` の `known`）を組み立てる純関数。
// ローカルの日の範囲は呼び出し側から受け取り、ここでは OS のタイムゾーンを読まない。

import type { DailyAchievement } from "../../../shared/achievement/achievement.ts"
import type { DoneTask } from "../../../shared/repository/task-summary.ts"
import { doneTasksSince, taskMilestoneOf } from "./done-task.ts"
import { graduationsOf } from "./graduation.ts"

export type DailyAchievementInput = {
  readonly date: string
  readonly today: string
  readonly range: { readonly startEpochMilliseconds: number; readonly endEpochMilliseconds: number }
  /** 終えたタスク（その日の一覧はこの順のまま出す）。 */
  readonly done: readonly DoneTask[]
  /** タスクID → 登録日の日付キー。 */
  readonly registeredOn: ReadonlyMap<string, string>
}

/** 日記は日記が持つ一覧なので、`diary` は常に「まだ振り返っていない」で返し、実際の値は配線層が差し替える。 */
export function dailyAchievementOf(input: DailyAchievementInput): DailyAchievement {
  const doneBeforeStart = doneTaskSummariesBefore(input.done, input.range.startEpochMilliseconds)
  const doneTasks = doneTasksSince(
    doneTaskSummariesBefore(input.done, input.range.endEpochMilliseconds),
    doneBeforeStart,
  )
  const milestone = taskMilestoneOf(
    input.done.filter(
      (task) =>
        task.closedAtEpochMilliseconds >= input.range.startEpochMilliseconds &&
        task.closedAtEpochMilliseconds < input.range.endEpochMilliseconds,
    ),
    doneBeforeStart.size,
  )
  return {
    kind: "known",
    date: input.date,
    today: input.today,
    doneTasks,
    graduations: graduationsOf(doneTasks, input.registeredOn, input.date),
    milestones: milestone === undefined ? [] : [milestone],
    diary: { kind: "none" },
  }
}

/** `beforeEpochMilliseconds` より前に終えたタスクを、タスクID → summary で（`done` の順のまま）返す。 */
function doneTaskSummariesBefore(
  done: readonly DoneTask[],
  beforeEpochMilliseconds: number,
): ReadonlyMap<string, string> {
  return new Map(
    done
      .filter((task) => task.closedAtEpochMilliseconds < beforeEpochMilliseconds)
      .map((task) => [task.id, task.summary]),
  )
}
