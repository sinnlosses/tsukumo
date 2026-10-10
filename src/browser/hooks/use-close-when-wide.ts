// 開いているあいだ、窓が狭い画面（760px 以下）でなくなったら閉じる。
// `@media` で隠す `<dialog>` は狭い画面でだけ描くので、広い窓に変わっても開いたまま（`display: none` のモーダル）残ると、ページ全体が押せなくなる。

import { useEffect } from "react"

import { PHONE_QUERY } from "./use-phone-width.ts"

export function useCloseWhenWide(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) {
      return
    }
    const phone = window.matchMedia(PHONE_QUERY)
    function closeWhenWide(): void {
      if (!phone.matches) {
        onClose()
      }
    }
    phone.addEventListener("change", closeWhenWide)
    return () => {
      phone.removeEventListener("change", closeWhenWide)
    }
  }, [open, onClose])
}
