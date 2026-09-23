// 開いている面（ポップオーバー・落ちてくる面）を閉じる合図を、**開いている間だけ** `document`
// から取る1つだけの仕事を持つフック。合図は2つ——`root` の外での `pointerdown` と、Esc。
//
// **`document` の購読は React の外との同期**なので `useEffect` で取る（`docs/coding-standards.md`
// 「React」の4類型のうち「外部システムの購読」）。**閉じている間はハンドラを1つも載せない。**
//
// **何を閉じるか・閉じたあとどこへフォーカスを戻すかは持たない**（呼び出し側が `onDismiss` で
// 決める）。合図の種類を引数で渡すのは、Esc のときだけフォーカスを押した口へ戻す呼び出し側が
// あるため（`features/screen-nav/hooks/use-current-work.ts`）。
//
// **どの機能の語彙も持たない**ので `browser/hooks/`（`docs/design.md` 2章の箱の表）。
//
// **`onDismiss` は呼び出しのたびに作り直さない**（`useCallback` で包んだものを渡す）。購読は
// `onDismiss` が変わると載せ直すので、毎描画で新しい関数を渡すと毎描画で付け外しが起きる。

import { useEffect, type RefObject } from "react"

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

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open, rootRef, onDismiss])
}
