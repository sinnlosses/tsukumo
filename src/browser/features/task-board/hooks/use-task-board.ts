// `<TaskBoard>` のロジック。**表を開いているかどうかは呼び出し側（サイドバーの区画）の state**
// で、ここはそれをそのまま `<Dialog open={...}>` へ渡す形に畳むのと、一覧を表の行へ畳むのを持つ
// （docs/design.md 2章「機能の中を分ける」）。
//
// `<dialog>` の開閉・Esc・backdrop のクリックは `components/ui/dialog/dialog.tsx` が持つので、
// ここは呼ばない。**この機能に固有のもの**（行への畳み方）だけを足す。
//
// **行への畳み方（`boardRows`）もこのファイルに同居させる。** 呼ぶのはこのフック1つで、
// `components/` は畳んだ `BoardRow` を受け取るだけ。
// **CSS の class 名はここでは決めない**（`domain/task-status.ts` と各部品の持ち物）。

import { useMemo } from "react"

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskReadiness,
  type TaskSummaryResult,
} from "../../../../shared/task-summary.ts"

export type TaskBoardView = {
  readonly open: boolean
  readonly rows: readonly BoardRow[] | undefined
}

/**
 * `open` をそのまま `<Dialog>` へ渡す形にし、畳んだ行を返す。
 *
 * **行は `tasks` の参照が変わったときだけ作り直す**（`useMemo`）。表を `memo` で止めているのは
 * この参照が安定していることが前提（`components/task-table.tsx`）。
 */
export function useTaskBoard(tasks: TaskSummaryResult, open: boolean): TaskBoardView {
  const rows = useMemo(() => boardRows(tasks), [tasks])

  return { open, rows }
}

/** 値が無い列に出す文字。**空欄にはしない**（列がずれて見えるため）。 */
const MISSING = "—"

export type BoardRow = {
  readonly id: string
  /** 色分けに使う生の status。`develop/tasks.json` に無ければ `undefined`。 */
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
 * 一覧を表の行へ畳む。読めていないときは `undefined` のまま返す（「読めない」と「0件」は
 * 出す文言が違うので、ここでは畳まない）。
 *
 * 「まだ done でないタスクのID」は**一覧全体から1回だけ**作り、行ごとの `taskReadiness` へ
 * 使い回す（`src/shared/task-summary.ts` 参照。以前は行ごとに作り直していた）。
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
    statusText: task.status ?? MISSING,
    difficultyText: task.difficulty ?? MISSING,
    loopableText: loopableMark(task.loopable),
    readiness: taskReadiness(task, unfinished),
    dependencies: task.dependencies,
    summary: task.summary,
    done: task.status === "done",
  }))
}

/**
 * `loopable`。**`N` は空欄にし、`Y` だけ文字を出す。**
 * 全行に文字が並ぶと、自動進行に載る `Y` が埋もれるため。**消すのは `N` だけ**で、値が無いときは
 * 他の列と同じ「—」、想定外の値はそのまま出す（読み手が気づけるようにする）。
 */
function loopableMark(loopable: string | undefined): string {
  if (loopable === undefined) {
    return MISSING
  }

  return loopable === "N" ? "" : loopable
}
