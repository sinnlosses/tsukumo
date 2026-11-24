// おすすめのカードに並べるタスクの順。
// タスク一覧（進捗管理のデータ）だけから決め、会話の内容は扱わない。

import { sortBy } from "remeda"

import {
  hasTaskStatus,
  taskReadiness,
  type TaskDifficulty,
  type TaskImportance,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../repository/task-summary.ts"

/** 並べた1件。 */
export type RecommendationOrderEntry = {
  readonly task: TaskSummaryItem
  /** このタスクを待っている、着手前か着手中のタスクの ID（一覧の順）。 */
  readonly waitedBy: readonly string[]
}

const LAUNCH_SKILL_PATTERN = /^[A-Za-z0-9_:-]+$/

/** 緊急度と重要度の順（小さいほど先）。 */
const LEVEL_ORDER = { high: 0, normal: 1, low: 2 } as const satisfies Record<TaskImportance, number>

/** 難しさの順（小さいほど先）。 */
const DIFFICULTY_ORDER = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
} as const satisfies Record<TaskDifficulty, number>

/** 一覧が届いていれば、着手できる未着手のタスクをおすすめの順に並べる。届いていなければ空。 */
export function readyTasksInOrder(tasks: TaskSummaryResult): readonly TaskSummaryItem[] {
  return tasks.kind === "known" ? recommendationOrder(tasks.items).map(({ task }) => task) : []
}

/**
 * タスクの着手を頼む文。`launchSkill` は利用者が書いた起動スキル名。
 * 先頭の `/` と前後の空白を畳み、空・使えない文字を含む値は未設定として固定の文面にする。
 */
export function taskStartRequest(taskId: string, launchSkill = ""): string {
  const skill = launchSkillOf(launchSkill)
  return skill === "" ? `タスク ${taskId} を進めて。` : `/${skill} ${taskId}`
}

/** 畳んだ起動スキル名。未設定・使えない文字を含む値は空文字。 */
export function launchSkillOf(raw: string): string {
  const skill = raw.trim().replace(/^\//, "").trim()
  return LAUNCH_SKILL_PATTERN.test(skill) ? skill : ""
}

/**
 * 着手できる未着手のタスクを、おすすめの順に並べる。
 * 上の決め手が同じときだけ下を見る。
 * 1. 緊急度の高いもの
 * 2. 重要度の高いもの
 * 3. 待っているタスクの多いもの
 * 4. 難しさの軽いもの（難しさの無いタスクは `sonnet` と同じ）
 * 5. 新しく登録されたもの（`items` の後ろ）
 */
export function recommendationOrder(
  items: readonly TaskSummaryItem[],
): readonly RecommendationOrderEntry[] {
  const ready = items.flatMap((task, index) =>
    taskReadiness(task)?.kind === "ready"
      ? [{ task, index, waitedBy: activeWaiterIds(items, task.id) }]
      : [],
  )
  return sortBy(
    ready,
    ({ task }) => LEVEL_ORDER[task.urgency],
    ({ task }) => LEVEL_ORDER[task.importance],
    [({ waitedBy }) => waitedBy.length, "desc"],
    ({ task }) => DIFFICULTY_ORDER[task.difficulty ?? "sonnet"],
    [({ index }) => index, "desc"],
  ).map(({ task, waitedBy }) => ({ task, waitedBy }))
}

/** 保留とドラフトのタスクは、いま動かせないので待ち手に数えない。 */
function activeWaiterIds(items: readonly TaskSummaryItem[], id: string): readonly string[] {
  return items
    .filter(
      (other) =>
        other.waitingFor.includes(id) &&
        (hasTaskStatus(other, "todo") || hasTaskStatus(other, "doing")),
    )
    .map((other) => other.id)
}
