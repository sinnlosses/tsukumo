// 筆先（いま本文を書いている筆の先。塊の上をZ字になぞる）を配る。**書いているのは
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
 * `top` / `bottom` は**いま書いている帯**（Z字の1画。`report-reveal.ts`）の上端と下端。
 * 帯は**トピック（見出しから次の見出しまで）の行を上下に割ったもの**で、要素をまたいで伸びる。
 * 行が1つしか取れないトピックでは、その上端と下端がそのまま入る。
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
