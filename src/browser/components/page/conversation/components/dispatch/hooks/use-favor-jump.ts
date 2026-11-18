// 入力欄の側から、紙の中のお願いの欄を見える範囲へ送り、その最初の押せる所へフォーカスを移す口。

import { useFavorVisibility } from "../../../stores/favor-visibility.ts"

/** お願いの欄が無いときは何もしない口を返す。 */
export function useFavorJump(): () => void {
  const favorId = useFavorVisibility((state) => state.favorId)
  return () => {
    if (favorId === undefined) {
      return
    }
    const favor = document.getElementById(favorId)
    favor?.scrollIntoView({ block: "start" })
    favor?.querySelector<HTMLElement>(FAVOR_FIRST_ACTION_SELECTOR)?.focus({ preventScroll: true })
  }
}

/** お願いの欄の中で最初にフォーカスを受ける口。 */
const FAVOR_FIRST_ACTION_SELECTOR = "button, a[href], input, textarea, select"
