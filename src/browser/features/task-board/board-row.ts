// 表の1行を、**画面に出す形まで畳んだもの**。列ごとの「値が無いときどうするか」と着手の判定を
// ここに集め、`components/` の部品は受け取った値をそのまま置くだけにする
// （docs/design.md 2章「機能の中を分ける」）。
//
// **CSS の class 名はここでは決めない**（`task-status.ts` と各部品の持ち物）。ここが持つのは
// 文字と真偽値だけなので、見た目を変えても畳み方は動かない。

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskReadiness,
  type TaskSummaryItem,
} from "../../../shared/task-summary.ts"

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
export function boardRows(
  tasks: readonly TaskSummaryItem[] | undefined,
): readonly BoardRow[] | undefined {
  if (tasks === undefined) {
    return undefined
  }

  const unfinished = unfinishedTaskIds(tasks)
  return tasks.map((task) => ({
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
