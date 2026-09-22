// `<TaskBoard>` のロジック。**表を開いているかどうかは呼び出し側（サイドバーの区画）の state**
// で、ここはそれを DOM へ写すのと、外側（backdrop）のクリックを閉じる操作に読み替えるのを持つ
// （docs/design.md 2章「機能の中を分ける」）。
//
// `<dialog>` の開閉そのものは機能の語彙を持たないので `browser/hooks/use-modal-dialog.ts`。
// ここはそれを呼んで、**この機能に固有の読み替え**（backdrop の判定）だけを足す。

import { useCallback, type MouseEvent, type RefObject } from "react"

import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"

export type TaskBoardView = {
  readonly dialogRef: RefObject<HTMLDialogElement | null>
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
}

/**
 * `open` に追随する `<dialog>` の ref と、外側のクリックを閉じる操作に読み替える呼び先を返す。
 * Esc で閉じたときは `<dialog onClose={...}>` が呼び出し側の state を戻す（ここでは拾わない）。
 */
export function useTaskBoard(open: boolean, onClose: () => void): TaskBoardView {
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

  return { dialogRef, onDialogClick }
}
