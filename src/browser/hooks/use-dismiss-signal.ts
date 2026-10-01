// 開いている面（ポップオーバー・落ちてくる面）を閉じる合図を、開いている間だけ `document` から取るフック。
// 合図は2つで、`root` の外での `pointerdown` と、Esc。閉じている間はハンドラを1つも載せない。
//
// 何を閉じるか・閉じたあとどこへフォーカスを戻すかは持たない（呼び出し側が `onDismiss` で決める）。
// 合図の種類を引数で渡すのは、Esc のときだけフォーカスを押した口へ戻す呼び出し側があるため。
//
// 購読は `onDismiss` が変わると載せ直す。

import { useEffect, type RefObject } from "react"

import { acquireOverlay } from "./open-overlay.ts"

/** 閉じる合図の出どころ。Esc とそれ以外を呼び出し側が区別できるようにする。 */
export type DismissCause = "outside" | "escape"

export type DismissSignalOptions = {
  readonly open: boolean
  /** 「外側」の基準になる要素。この中での `pointerdown` では閉じない。 */
  readonly rootRef: RefObject<HTMLElement | null>
  readonly onDismiss: (cause: DismissCause) => void
}

export function useDismissSignal(options: DismissSignalOptions): void {
  const { open, rootRef, onDismiss } = options

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnOutside(event: PointerEvent): void {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        onDismiss("outside")
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onDismiss("escape")
      }
    }

    const releaseOverlay = acquireOverlay()
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      releaseOverlay()
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open, rootRef, onDismiss])
}
