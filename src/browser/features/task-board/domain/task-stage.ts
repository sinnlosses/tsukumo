// サイドバーの一覧を状態の段に分ける。段は taskStateOf の kind で決める。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { taskStateOf } from "./task-board-content.ts"

export type TaskStage = "now" | "next" | "waiting" | "draft" | "done"

export type TaskStageGroup = {
  readonly stage: TaskStage
  readonly tasks: readonly TaskSummaryItem[]
}

export const TASK_STAGE_LABEL = {
  now: "いま",
  next: "つぎ",
  waiting: "待ち",
  draft: "ドラフト",
  done: "済み",
} as const satisfies Record<TaskStage, string>

const STAGE_ORDER = [
  "now",
  "next",
  "waiting",
  "draft",
  "done",
] as const satisfies readonly TaskStage[]

/** 段ごとの並び。上の順で、0件の段は含めない。段の中は渡された順で、済みの段だけ番号の降順。 */
export function stageTasks(items: readonly TaskSummaryItem[]): readonly TaskStageGroup[] {
  return STAGE_ORDER.flatMap((stage) => {
    const inStage = items.filter((task) => stageOf(task) === stage)
    if (inStage.length === 0) {
      return []
    }
    return [{ stage, tasks: stage === "done" ? sortByNumberDescending(inStage) : inStage }]
  })
}

function stageOf(task: TaskSummaryItem): TaskStage {
  switch (taskStateOf(task).kind) {
    case "doing":
      return "now"
    case "ready":
      return "next"
    case "blocked":
    case "hold":
    case "other":
      return "waiting"
    case "draft":
      return "draft"
    case "done":
      return "done"
  }
}

/** 番号が取れない ID は渡された順のまま末尾に置く。 */
function sortByNumberDescending(tasks: readonly TaskSummaryItem[]): readonly TaskSummaryItem[] {
  const numbered = tasks.filter((task) => TRAILING_NUMBER.test(task.id))
  const unnumbered = tasks.filter((task) => !TRAILING_NUMBER.test(task.id))
  return [...numbered.toSorted((a, b) => numberOf(b.id) - numberOf(a.id)), ...unnumbered]
}

const TRAILING_NUMBER = /(\d+)$/

function numberOf(id: string): number {
  return Number(TRAILING_NUMBER.exec(id)?.[1])
}
