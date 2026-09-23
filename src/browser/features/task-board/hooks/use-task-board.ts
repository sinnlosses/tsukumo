// `<TaskBoard>` のロジック。**表を開いているかどうかは呼び出し側（サイドバーの区画）の state**
// で、ここはそれを DOM へ写すのと、外側（backdrop）のクリックを閉じる操作に読み替えるのと、
// 一覧を表の行へ畳むのを持つ（docs/design.md 2章「機能の中を分ける」）。
//
// `<dialog>` の開閉そのものは機能の語彙を持たないので `browser/hooks/use-modal-dialog.ts`。
// ここはそれを呼んで、**この機能に固有のもの**だけを足す。
//
// **行への畳み方（`boardRows`）もこのファイルに同居させる。** 呼ぶのはこのフック1つで、
// `components/` は畳んだ `BoardRow` を受け取るだけ。
// **CSS の class 名はここでは決めない**（`domain/task-status.ts` と各部品の持ち物）。

import { useCallback, useMemo, type MouseEvent, type RefObject } from "react"

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskReadiness,
  type TaskSummaryResult,
} from "../../../../shared/task-summary.ts"
import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"

export type TaskBoardView = {
  readonly ref: RefObject<HTMLDialogElement | null>
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
  readonly rows: readonly BoardRow[] | undefined
}

/**
 * `open` に追随する `<dialog>` の ref と、外側のクリックを閉じる操作に読み替える呼び先、
 * 畳んだ行を返す。Esc で閉じたときは `<dialog onClose={...}>` が呼び出し側の state を戻す
 * （ここでは拾わない）。
 *
 * **行は `tasks` の参照が変わったときだけ作り直す**（`useMemo`）。表を `memo` で止めているのは
 * この参照が安定していることが前提（`components/task-table.tsx`）。
 */
export function useTaskBoard(
  tasks: TaskSummaryResult,
  open: boolean,
  onClose: () => void,
): TaskBoardView {
  const dialogRef = useModalDialog(open)

  // backdrop のクリックは `<dialog>` 自身が受け取る（中身は子要素が受け取る）。
  const onDialogClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>): void => {
      if (event.target === dialogRef.current) {
        onClose()
      }
    },
    [dialogRef, onClose],
  )

  const rows = useMemo(() => boardRows(tasks), [tasks])

  return { ref: dialogRef, onDialogClick, rows }
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
