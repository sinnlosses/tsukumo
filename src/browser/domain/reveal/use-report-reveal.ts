// 確定したレポートを「書き上げていくように見せる」演出の入口。
// 塊（節）を上から順に、間隔を空けてポンと出す（`startPop`）。ここはいつ始めるかだけを決める。
//
// `prefers-reduced-motion: reduce` では演出ごと無効（`theme.css` の規則は CSS のアニメーションにしか効かず、塊を隠すのはここなので、ここでも見る）。

import { useEffectEvent, useRef, useState, type RefObject } from "react"

import { useBeforePaintSync } from "../../hooks/use-before-paint-sync.ts"
import { loadRevealSpeed, popIntervalOf } from "../reveal-speed.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"
import { startPop } from "./start-pop.ts"

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、マウントした直後から塊を順に出す。
 * `turnId` はこの本文が載っているやり取りで、配る筆先に添えて持たせる。
 * `popClassName` は出した塊に1回だけ付ける、ポンの animation を持つ class。
 *
 * 見るのはマウントした時点の `reveal` だけ。
 * あとから対象でなくなっても（後ろに別のレポートが現れても）始めた演出は最後まで進める（途中で止めると隠れた塊が残る）。
 * `onPlayed` は、マウント時の `reveal` が真だったときに1回だけ呼ぶ（呼び出し元が「もう見せた」を覚える口）。
 * 「書き上げる演出の速さ」もマウント時の値だけを見る（速さを変えても、出している最中の演出は前の速さのまま進み切る）。
 * `revealing` は塊を出している最中か。マウント時の `reveal` が真なら真で始まり、出し切るか演出しないと決まったら偽になる。
 */
export function useReportReveal(
  reveal: boolean,
  turnId: number,
  onPlayed: () => void,
  popClassName: string,
): { readonly rootRef: RefObject<HTMLDivElement | null>; readonly revealing: boolean } {
  const rootRef = useRef<HTMLDivElement>(null)
  const played = useEffectEvent(onPlayed)
  const [revealOnMount] = useState(reveal)
  const [revealSpeed] = useState(loadRevealSpeed)
  const [revealing, setRevealing] = useState(reveal)
  // 同じ本文を二度出さない。
  // `<Activity mode="hidden">` は部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // 描画の前に走る `useBeforePaintSync` でなければならない。描画のあとに走る同期だと、隠す前の本文が1フレームだけ全部見えてしまう。
  // 依存はマウント時に決まったきり変わらない（`<Turn>` はやり取りの番号を `key` に持つので、`turnId` が変わるときは部品ごと作り直される）。
  useBeforePaintSync(() => {
    const root = rootRef.current
    // 演出を見せる側に立った時点で知らせる（速さが「切る」・動きを減らす設定で出さなくても、見せたことにする）。
    if (revealOnMount) {
      played()
    }
    if (
      !revealOnMount ||
      revealedOnce.current ||
      root === null ||
      revealSpeed === "off" ||
      prefersReducedMotion((query) => window.matchMedia(query))
    ) {
      setRevealing(false)
      return undefined
    }
    revealedOnce.current = true
    return startPop(root, turnId, {
      intervalMs: popIntervalOf(revealSpeed),
      popClassName,
      onFinish: () => setRevealing(false),
    })
  }, [revealOnMount, turnId, revealSpeed, popClassName])

  return { rootRef, revealing }
}
