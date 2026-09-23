// 画面の書き換え1回を View Transition（`document.startViewTransition`）に載せる。書き換える前と
// 後の絵をブラウザが撮って、その間を短く移り変わらせる（`view-transition-name` を持つ要素は位置と
// 大きさを移し、残りは重ねて溶かす）。見せ方の規則は `styles/theme.css` の `::view-transition-*`。
//
// **載せない道が2つある** — ブラウザが API を持たないときと、利用者が「動きを減らす」を選んで
// いるとき（`styles/theme.css` の全体規則は `::view-transition-*` の擬似要素に当たらないので、
// ここで見る）。どちらも書き換えをその場で1回行うだけで、見た目が瞬時に変わる以外は同じ。

import { flushSync } from "react-dom"

import { prefersReducedMotion } from "./reduced-motion.ts"

/**
 * `update` を移り変わりに載せて走らせる。**`update` は React の描き直しを起こす処理**を渡す
 * （ブラウザが「後」の絵を撮るのは callback が返った時点なので、`flushSync` でその中に DOM の
 * 書き換えまで終わらせる）。載せられないときは、その場で1回だけ呼ぶ。
 */
export function withViewTransition(update: () => void): void {
  if (!("startViewTransition" in document) || prefersReducedMotion()) {
    update()
    return
  }
  document.startViewTransition(() => {
    flushSync(update)
  })
}
