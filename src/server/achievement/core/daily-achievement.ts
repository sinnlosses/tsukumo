// 読み終えたコミットと Beads の課題から、1日ぶんの成果（`DailyAchievement` の `known`）を組み立てる純関数。
// ローカル時刻の文字列は呼び出し側から関数で受け取り、ここでは OS のタイムゾーンを読まない。

import type {
  AchievementCommits,
  AchievementMilestone,
  DailyAchievement,
} from "../../../shared/achievement/achievement.ts"
import type { DoneTask } from "../../../shared/repository/task-summary.ts"
import {
  achievementCommitsInRange,
  commitMilestoneOf,
  countAchievementCommits,
  type AchievementCommit,
} from "./achievement-commit.ts"
import { doneTasksSince, taskMilestoneOf } from "./done-task.ts"
import { graduationsOf } from "./graduation.ts"

export function epochSecondsOf(epochMs: number): number {
  return Math.floor(epochMs / 1000)
}

/** 終えたタスクの材料。終えたタスク（番号の順）と、タスクID → 登録日の日付キーの表。 */
export type DoneTaskSources = {
  readonly done: readonly DoneTask[]
  readonly registeredOn: ReadonlyMap<string, string>
}

/** コミットの材料。数える枝から読んだコミットと、その日の始まりまでの通算のコミットの数。 */
export type DailyCommits =
  | { readonly kind: "unread" }
  | {
      readonly kind: "read"
      readonly commits: readonly AchievementCommit[]
      readonly totalCommitsBeforeToday: number
    }

export type DailyAchievementInput = {
  readonly date: string
  readonly today: string
  readonly range: { readonly startEpochMilliseconds: number; readonly endEpochMilliseconds: number }
  /** 数える枝が読めないときは `unread`。 */
  readonly commits: DailyCommits
  /** 終えたタスクを数えられないときは `untracked`。 */
  readonly tasks: { readonly kind: "untracked" } | ({ readonly kind: "tracked" } & DoneTaskSources)
  /** エポックミリ秒 → `HH:MM`（ローカル時刻）。 */
  readonly timeOf: (epochMilliseconds: number) => string
}

/** 日記は日記が持つ一覧なので、`diary` は常に「まだ振り返っていない」で返し、実際の値は配線層が差し替える。 */
export function dailyAchievementOf(input: DailyAchievementInput): DailyAchievement {
  const { commits, commitMilestone } = commitsOfDay(input)
  const common = {
    kind: "known",
    date: input.date,
    today: input.today,
    commits,
    diary: { kind: "none" },
  } as const

  if (input.tasks.kind === "untracked") {
    return {
      ...common,
      doneTasks: { kind: "unknown" },
      graduations: [],
      milestones: commitMilestone === undefined ? [] : [commitMilestone],
    }
  }

  const doneBeforeStart = doneTaskSummariesBefore(
    input.tasks.done,
    input.range.startEpochMilliseconds,
  )
  const items = doneTasksSince(
    doneTaskSummariesBefore(input.tasks.done, input.range.endEpochMilliseconds),
    doneBeforeStart,
  )
  const taskMilestone = taskMilestoneOf(items, doneBeforeStart.size)
  return {
    ...common,
    doneTasks: { kind: "known", items },
    graduations: graduationsOf(items, input.tasks.registeredOn, input.date),
    milestones: [taskMilestone, commitMilestone].filter(
      (milestone): milestone is AchievementMilestone => milestone !== undefined,
    ),
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

/** その日のコミットの数と節目「commit」。コミットを読めていなければ数は `unknown` で節目は無い。 */
function commitsOfDay(input: DailyAchievementInput): {
  readonly commits: AchievementCommits
  readonly commitMilestone: AchievementMilestone | undefined
} {
  if (input.commits.kind === "unread") {
    return { commits: { kind: "unknown" }, commitMilestone: undefined }
  }
  const startEpochSeconds = epochSecondsOf(input.range.startEpochMilliseconds)
  const endEpochSeconds = epochSecondsOf(input.range.endEpochMilliseconds)
  return {
    commits: {
      kind: "known",
      count: countAchievementCommits(input.commits.commits, startEpochSeconds, endEpochSeconds),
    },
    commitMilestone: commitMilestoneOfDay(
      achievementCommitsInRange(input.commits.commits, startEpochSeconds, endEpochSeconds).map(
        (commit) => commit.committedAtEpochSeconds,
      ),
      input.commits.totalCommitsBeforeToday,
      input.timeOf,
    ),
  }
}

/** {@link commitMilestoneOf} の結果を {@link AchievementMilestone} の形にする。 */
function commitMilestoneOfDay(
  todaysCommitEpochSeconds: readonly number[],
  totalCommitsBeforeToday: number,
  timeOf: (epochMilliseconds: number) => string,
): AchievementMilestone | undefined {
  const crossed = commitMilestoneOf(todaysCommitEpochSeconds, totalCommitsBeforeToday)
  return crossed === undefined
    ? undefined
    : { kind: "commit", count: crossed.count, time: timeOf(crossed.committedAtEpochSeconds * 1000) }
}
