// 開いているあいだ、窓が狭い画面（760px 以下）でなくなったら閉じる。
// 板は狭い画面でだけ描くので、広い窓に変わっても開いたまま（`display: none` のモーダル）残ると、ページ全体が押せなくなる。

import { useEffect } from "react"

const PHONE_QUERY = "(max-width: 760px)"

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
