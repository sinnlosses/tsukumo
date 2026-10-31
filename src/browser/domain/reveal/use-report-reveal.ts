// 確定したレポートを「書き上げていくように見せる」演出の入口。
// DOM は完成品を一度に作り、見せる範囲だけを進める。
// 文字を足していく実装にすると、表・mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// 筆はトピック1つをZ字で書く。
// その中の行を上下2つの帯に割り、帯ごとに左から右へなぞって、あいだを斜めに戻る（Z字の3画）。
// 帯の切れ目は実際の行の box に合わせるので、文字が上下に切れることはない（1行しかない塊は1画で書く）。
//
// ここはフレームを回すだけ。
//
// 座標はすべて本文の入れ物（`data-brush-origin`。無ければ根）の左上を原点にする。
// 書き上げたあとも筆先はその場に残るので、ビューポート基準のままだと転がすたびに関係ない場所へずれる。
// 器を送っても動かない原点なので、塊の box は書き始めるときに1回測って持ち回り、測り直すのは box が変わる出来事（`watchLayoutChange`）のあとだけにする。
//
// 打ち切る口は2つ（クリック・キー入力）。ホイールと指では打ち切らない。
// 先を読もうとして転がすのは「もう要らない」ではなく「見ていたい」の側なので、打ち切ると筆を追うたびに筆が消える。
// 代わりに、手で転がしたら筆先を追う自動送りだけを降ろす。
// `scroll` そのものは聞かない（スクロールアンカリングや `scrollIntoView` でも飛んでくるので、利用者の操作そのものだけを合図にする）。
//
// 筆で書くのは節の欄（頭の欄の後ろ）だけで、結論と検証結果は最初から出す。節が短いレポートは演出しない。
//
// `prefers-reduced-motion: reduce` では演出ごと無効（`theme.css` の規則は CSS のアニメーションにしか効かないので、ここでも見る）。

import { useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { loadRevealSpeed, revealTimingOf } from "../reveal-speed.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"
import { startReveal } from "./start-reveal.ts"

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、マウントした直後から見せる範囲を進める。
 * `turnId` はこの本文が載っているやり取りで、配る筆先に添えて持たせる。
 *
 * 見るのはマウントした時点の `reveal` だけ。
 * あとから対象でなくなっても（後ろに別のレポートが現れても）始めた演出は最後まで進める（途中で止めると書きかけの本文が残る）。
 * `onPlayed` は、マウント時の `reveal` が真だったときに1回だけ呼ぶ（呼び出し元が「もう見せた」を覚える口）。
 * 「書き上げる演出の速さ」もマウント時の値だけを見る（速さを変えても、書いている最中の演出は前の速さのまま進み切る）。
 */
export function useReportReveal(
  reveal: boolean,
  turnId: number,
  onPlayed: () => void,
): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const played = useEffectEvent(onPlayed)
  const [revealOnMount] = useState(reveal)
  const [revealSpeed] = useState(loadRevealSpeed)
  // 同じ本文を二度書かない。
  // `<Activity mode="hidden">` は部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // `useLayoutEffect` でなければならない。`useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ全部見えてしまう。
  // 依存はどちらもマウント時に決まったきり変わらない（`<Turn>` はやり取りの番号を `key` に持つので、`turnId` が変わるときは部品ごと作り直される）。
  useLayoutEffect(() => {
    const root = rootRef.current
    // 演出を見せる側に立った時点で知らせる（速さが「切る」・動きを減らす設定で書かなくても、見せたことにする）。
    if (revealOnMount) {
      played()
    }
    if (
      !revealOnMount ||
      revealedOnce.current ||
      root === null ||
      prefersReducedMotion((query) => window.matchMedia(query))
    ) {
      return undefined
    }
    // 「切る」は物差しを持たない。`startReveal` を呼ばずに済ませると本文はすぐ全部出た状態のままで、ミニ立ち絵の筆も出ない。
    if (revealSpeed === "off") {
      return undefined
    }
    revealedOnce.current = true
    return startReveal(root, turnId, revealTimingOf(revealSpeed), () => performance.now())
  }, [revealOnMount, turnId, revealSpeed])

  return rootRef
}
