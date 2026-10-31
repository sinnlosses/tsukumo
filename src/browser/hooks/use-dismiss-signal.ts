// 開いている面（ポップオーバー・落ちてくる面）を閉じる合図を、開いている間だけ `document` から取るフック。
// 合図は2つで、`root` の外での `pointerdown` と、Esc。閉じている間はハンドラを1つも載せない。
//
// 何を閉じるか・閉じたあとどこへフォーカスを戻すかは持たない（呼び出し側が `onDismiss` で決める）。
// 合図の種類を引数で渡すのは、Esc のときだけフォーカスを押した口へ戻す呼び出し側があるため。
//
// 購読は `open` が変わるときだけ載せ直す（`onDismiss` は最新を読む）。

import type { RefObject } from "react"

import { acquireOverlay } from "./open-overlay.ts"
import { useEventListener } from "./use-event-listener.ts"
import { useExternalSync } from "./use-external-sync.ts"

/** 閉じる合図の出どころ。Esc とそれ以外を呼び出し側が区別できるようにする。 */
export type DismissCause = "outside" | "escape"

type DismissSignalOptions = {
  readonly open: boolean
  /** 「外側」の基準になる要素。この中での `pointerdown` では閉じない。 */
  readonly rootRef: RefObject<HTMLElement | null>
  readonly onDismiss: (cause: DismissCause) => void
}

export function useDismissSignal(options: DismissSignalOptions): void {
  const { open, rootRef, onDismiss } = options

  useExternalSync(() => {
    if (!open) {
      return
    }
    return acquireOverlay()
  }, [open])

  useEventListener(
    document,
    "pointerdown",
    (event) => {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        onDismiss("outside")
      }
    },
    { enabled: open },
  )

  useEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        onDismiss("escape")
      }
    },
    { enabled: open },
  )
}
