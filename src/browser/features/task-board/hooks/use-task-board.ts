// `<TaskBoard>` のロジック。**表を開いているかどうかは呼び出し側（サイドバーの区画）の state**
// で、ここはそれを DOM へ写すのと、外側（backdrop）のクリックを閉じる操作に読み替えるのと、
// 一覧を表の行へ畳むのを持つ（docs/design.md 2章「機能の中を分ける」）。
//
// `<dialog>` の開閉そのものは機能の語彙を持たないので `browser/hooks/use-modal-dialog.ts`。
// ここはそれを呼んで、**この機能に固有のもの**だけを足す。

import { useCallback, useMemo, type MouseEvent, type RefObject } from "react"

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"
import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import { boardRows, type BoardRow } from "../board-row.ts"

export type TaskBoardView = {
  readonly dialogRef: RefObject<HTMLDialogElement | null>
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
  tasks: readonly TaskSummaryItem[] | undefined,
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

  return { dialogRef, onDialogClick, rows }
}
