// `<TaskBoard>` のロジック。
// 表を開いているかどうかは呼び出し側の state で、ここはそれをそのまま `<Dialog open={...}>` へ渡す形に畳むのと、一覧を表の行へ畳むのを持つ。
// CSS の class 名はここでは決めない。

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskReadiness,
  type TaskSummaryResult,
} from "../../../../shared/repository/task-summary.ts"

export type TaskBoardView = {
  readonly open: boolean
  readonly rows: readonly BoardRow[] | undefined
}

export function useTaskBoard(tasks: TaskSummaryResult, open: boolean): TaskBoardView {
  return { open, rows: boardRows(tasks) }
}

/** 値が無い列に出す文字。空欄にはしない（列がずれて見えるため）。 */
const MISSING = "—"

export type BoardRow = {
  readonly id: string
  /** 色分けに使う生の status。読めなければ `undefined`。 */
  readonly status: string | undefined
  readonly statusText: string
  readonly difficultyText: string
  /** `N` は空欄（下の `loopableMark`）。 */
  readonly loopableText: string
  /** `todo` のときだけ着手できるかを判定する。それ以外は `undefined`。 */
  readonly readiness: TaskReadiness | undefined
  readonly dependencies: readonly string[]
  readonly summary: string
  /** 済んだ行は薄く出す。 */
  readonly done: boolean
}

/**
 * 一覧を表の行へ畳む。読めていないときは `undefined` のまま返す（「読めない」と「0件」は出す文言が違うので、ここでは畳まない）。
 *
 * 「まだ done でないタスクのID」は一覧全体から1回だけ作り、行ごとの `taskReadiness` へ使い回す。
 */
export function boardRows(tasks: TaskSummaryResult): readonly BoardRow[] | undefined {
  if (tasks.kind === "unknown") {
    return undefined
  }

  const items = tasks.items
  const unfinished = unfinishedTaskIds(items)
  return items.map((task) => ({
    id: task.id,
    status: task.status,
    statusText: statusTextOf(task.status, task.assignee),
    difficultyText: task.difficulty ?? MISSING,
    loopableText: loopableMark(task.loopable),
    readiness: taskReadiness(task, unfinished),
    dependencies: task.dependencies,
    summary: task.summary,
    done: task.status === "done",
  }))
}

/** status の文字。着手した作業ツリーが分かれば括弧で添える（Beads 方式の着手中）。 */
function statusTextOf(status: string | undefined, assignee: string | undefined): string {
  const text = status ?? MISSING
  return assignee === undefined ? text : `${text}（${assignee}）`
}

/**
 * `loopable`。`N` は空欄にし、`Y` だけ文字を出す。
 * 全行に文字が並ぶと、自動進行に載る `Y` が埋もれるため。
 * 消すのは `N` だけで、値が無いときは他の列と同じ「—」、想定外の値はそのまま出す（読み手が気づけるようにする）。
 */
function loopableMark(loopable: string | undefined): string {
  if (loopable === undefined) {
    return MISSING
  }

  return loopable === "N" ? "" : loopable
}
