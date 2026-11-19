// 立ち絵が従っているセリフの行（`data-followed`）まで流れを送る。
// 入力欄の上の定位置の声は流れの外にあるので送らない。

import { smoothScrollBehavior } from "../../hooks/smooth-scroll.ts"

/** 描画が済んでから呼ぶ（従う行の印は、留めを解いた描画のあとで付く）。 */
export function scrollToFollowedRow(): void {
  const row = document.querySelector("[data-followed]")
  if (row === null || row.closest("[data-voice-slot]") !== null) {
    return
  }
  row.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() })
}
