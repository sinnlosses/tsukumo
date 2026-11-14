// 開いているあいだ、ビューポートが狭い画面（760px 以下）でなくなったら閉じる。
// `@media` で隠す `<dialog>` は狭い画面でだけ描くので、広いビューポートに変わっても開いたまま（`display: none` のモーダル）残ると、ページ全体が押せなくなる。

import { useState } from "react"

import { useEventListener } from "./use-event-listener.ts"
import { PHONE_QUERY } from "./use-phone-width.ts"

export function useCloseWhenWide(open: boolean, onClose: () => void): void {
  const [phone] = useState(() => window.matchMedia(PHONE_QUERY))
  useEventListener(
    phone,
    "change",
    () => {
      if (!phone.matches) {
        onClose()
      }
    },
    { enabled: open },
  )
}
