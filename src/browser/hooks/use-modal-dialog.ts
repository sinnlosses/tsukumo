// `<dialog>` を `showModal()` / `close()` で開閉する1つだけの仕事を持つフック。開いているか
// どうかは呼び出し側の state が持ち、**DOM のほうをそれに追随させる**（DOM の側に第2の状態を
// 作らない）。React の外にある状態（top layer に載っているかどうか）への書き込みなので
// `useEffect` で同期する（docs/coding-standards.md「React」の4類型の2つ目）。
//
// **どの機能の語彙も持たない**ので `browser/hooks/`（docs/design.md 2章の箱の表）。
//
// **Esc で閉じたときの `close` イベントはここで拾わない。** 呼び出し側が `<dialog onClose={...}>`
// として書くほうが、「閉じたら state を戻す」が JSX の1箇所で読めるため。

import { useEffect, useRef, type RefObject } from "react"

/** `open` に追随する `<dialog>` の ref を返す。要素へは `<dialog ref={...}>` で渡す。 */
export function useModalDialog(open: boolean): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return dialogRef
}
