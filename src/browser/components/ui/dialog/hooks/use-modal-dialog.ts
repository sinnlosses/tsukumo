// `<dialog>` を `showModal()` / `close()` で開閉するフック。
// 開いているかどうかは呼び出し側の state が持ち、DOM のほうをそれに追随させる（DOM の側に第2の状態を作らない）。
//
// Esc で閉じたときの `close` イベントはここで拾わない。
// 呼び出し側が `<dialog onClose={...}>` として書くほうが、「閉じたら state を戻す」が JSX の1箇所で読めるため。

import { useRef, type RefObject } from "react"

import { acquireOverlay } from "../../../../hooks/open-overlay.ts"
import { useExternalSync } from "../../../../hooks/use-external-sync.ts"

/** `open` に追随する `<dialog>` の ref を返す。要素へは `<dialog ref={...}>` で渡す。 */
export function useModalDialog(open: boolean): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useExternalSync(() => {
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
    return open ? acquireOverlay() : undefined
  }, [open])

  return dialogRef
}
