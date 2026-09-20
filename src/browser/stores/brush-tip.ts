// 筆先（いま書かれている本文の、見えている最後の文字の右端）を配る。**書いているのは
// `features/main-view/report-reveal.ts` だが、読むのは立ち絵の側**（キャラビュー）になるので、
// 機能どうしの import にならないよう `stores/` に置く（`docs/design.md` 2章。
// `stores/turn-selection.tsx` と同じ理由）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、ブラウザの描画のあいだだけ
// 存在する値だから。演出が終われば undefined に戻る（筆先は消える）。
//
// React の外に1つだけ持つ（演出は同時に1つしか走らない。`report-reveal.ts`）。

import { useSyncExternalStore } from "react"

/**
 * 筆先の位置。**ビューポート座標**（`getBoundingClientRect()` / `getClientRects()` と同じ原点）
 * なので、追従する側は `position: fixed` でそのまま置ける。
 *
 * `top` / `bottom` はその文字が乗っている行の上端と下端。塊ごと出す図・グラフでは、`x` が
 * 塊の左端、`top` / `bottom` が塊の上端と下端になる（脇に立たせるため）。
 */
export type BrushTip = {
  readonly x: number
  readonly top: number
  readonly bottom: number
}

/** 筆先を配る。演出が終わったら undefined を配って消す。 */
export function publishBrushTip(next: BrushTip | undefined): void {
  tip = next
  for (const listener of listeners) {
    listener()
  }
}

/** いまの筆先（書かれていなければ undefined）。 */
export function useBrushTip(): BrushTip | undefined {
  return useSyncExternalStore(subscribeBrushTip, brushTipSnapshot, brushTipSnapshot)
}

let tip: BrushTip | undefined = undefined
const listeners = new Set<() => void>()

function subscribeBrushTip(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** **同じ筆先なら同じオブジェクト**を返す（`useSyncExternalStore` の約束）。 */
function brushTipSnapshot(): BrushTip | undefined {
  return tip
}
