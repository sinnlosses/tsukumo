// 読み終えた `main` の履歴から、1日ぶんの成果（`DailyAchievement` の `known`）を組み立てる純関数。
// ローカル時刻の文字列は呼び出し側から関数で受け取り、ここでは OS のタイムゾーンを読まない。

import type {
  AchievementMilestone,
  DailyAchievement,
} from "../../../shared/achievement/achievement.ts"
import {
  closedBeadsTaskSummariesBefore,
  type BeadsIssue,
} from "../../../shared/repository/beads-issue.ts"
import {
  achievementCommitsInRange,
  commitMilestoneOf,
  countAchievementCommits,
  type AchievementCommit,
} from "./achievement-commit.ts"
import {
  doneTasksSince,
  doneTaskSummaries,
  taskMilestoneOf,
  unionDoneTaskSummaries,
  type TaskSnapshotSource,
} from "./done-task-source.ts"
import {
  deletedDoneTaskSummariesBefore,
  graduationsOf,
  taskRegistrationDates,
  type DeletedTaskFile,
  type TaskFileHistoryCommit,
} from "./task-file-history.ts"

export function epochSecondsOf(epochMs: number): number {
  return Math.floor(epochMs / 1000)
}

/** 終えたタスクの材料。日の終わりと始まりの切り口、消えたタスクファイル、Beads の課題、登録日の表の元。 */
export type DoneTaskSources = {
  readonly endSource: TaskSnapshotSource
  readonly startSource: TaskSnapshotSource
  readonly deletedFiles: readonly DeletedTaskFile[]
  readonly issues: readonly BeadsIssue[]
  readonly historyCommits: readonly TaskFileHistoryCommit[]
  /** Beads の課題ごとの作った日（タスクID → 日付キー）。 */
  readonly beadsCreatedOn: ReadonlyMap<string, string>
}

export type DailyAchievementInput = {
  readonly date: string
  readonly today: string
  readonly range: { readonly startEpochMilliseconds: number; readonly endEpochMilliseconds: number }
  readonly commits: readonly AchievementCommit[]
  readonly totalCommitsBeforeToday: number
  /** 終えたタスクを数えられないときは `untracked`。 */
  readonly tasks: { readonly kind: "untracked" } | ({ readonly kind: "tracked" } & DoneTaskSources)
  /** エポックミリ秒 → `HH:MM`（ローカル時刻）。 */
  readonly timeOf: (epochMilliseconds: number) => string
}

/** 日記は日記が持つ一覧なので、`diary` は常に「まだ振り返っていない」で返し、実際の値は配線層が差し替える。 */
export function dailyAchievementOf(input: DailyAchievementInput): DailyAchievement {
  const startEpochSeconds = epochSecondsOf(input.range.startEpochMilliseconds)
  const endEpochSeconds = epochSecondsOf(input.range.endEpochMilliseconds)
  const commitMilestone = commitMilestoneOfDay(
    achievementCommitsInRange(input.commits, startEpochSeconds, endEpochSeconds).map(
      (commit) => commit.committedAtEpochSeconds,
    ),
    input.totalCommitsBeforeToday,
    input.timeOf,
  )
  const common = {
    kind: "known",
    date: input.date,
    today: input.today,
    commitCount: countAchievementCommits(input.commits, startEpochSeconds, endEpochSeconds),
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

  const endUnion = doneTaskUnionAt(
    input.tasks,
    input.tasks.endSource,
    input.range.endEpochMilliseconds,
  )
  const startUnion = doneTaskUnionAt(
    input.tasks,
    input.tasks.startSource,
    input.range.startEpochMilliseconds,
  )
  const items = doneTasksSince(endUnion, startUnion)
  const registeredOnById = taskRegistrationDates(
    input.tasks.historyCommits,
    input.tasks.beadsCreatedOn,
  )
  const taskMilestone = taskMilestoneOf(items, startUnion.size)
  return {
    ...common,
    doneTasks: { kind: "known", items },
    graduations: graduationsOf(items, registeredOnById, input.date),
    milestones: [taskMilestone, commitMilestone].filter(
      (milestone): milestone is AchievementMilestone => milestone !== undefined,
    ),
  }
}

/** ある時刻までに終えたタスク。切り口・消えたタスクファイル・Beads の閉じた課題の和を ID でとる。 */
function doneTaskUnionAt(
  sources: DoneTaskSources,
  snapshot: TaskSnapshotSource,
  boundaryEpochMilliseconds: number,
): ReadonlyMap<string, string> {
  return unionDoneTaskSummaries(
    unionDoneTaskSummaries(
      doneTaskSummaries(snapshot),
      deletedDoneTaskSummariesBefore(
        sources.deletedFiles,
        epochSecondsOf(boundaryEpochMilliseconds),
      ),
    ),
    closedBeadsTaskSummariesBefore(sources.issues, boundaryEpochMilliseconds),
  )
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
