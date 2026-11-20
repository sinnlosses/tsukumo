// 確定したレポートを「書き上げていくように見せる」演出の入口。
// 塊（節）を上から順に、間隔を空けてポンと出す（`startPop`）。ここはいつ始めるかだけを決める。
//
// `prefers-reduced-motion: reduce` では演出ごと無効（`styles/reduced-motion.css` の規則は CSS のアニメーションにしか効かず、塊を隠すのはここなので、ここでも見る）。

import { useEffectEvent, useRef, useState, type RefObject } from "react"

import type { RevealSpeed } from "../../../shared/session/gear-preference.ts"
import { useBeforePaintSync } from "../../hooks/use-before-paint-sync.ts"
import { popIntervalOf } from "../reveal-speed.ts"
import { startPop } from "./start-pop.ts"

/** 演出を掛けるかを決める、マウントした時点の歯車の「書き上げる速さ」と、動きを減らすか。 */
export type RevealMotion = {
  readonly revealSpeed: RevealSpeed
  readonly reducedMotion: boolean
}

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、マウントした直後から塊を順に出す。
 * `popClassName` は出した塊に1回だけ付ける、ポンの animation を持つ class。
 *
 * 見るのはマウントした時点の `reveal` だけ。
 * あとから対象でなくなっても（後ろに別のレポートが現れても）始めた演出は最後まで進める（途中で止めると隠れた塊が残る）。
 * `onPlayed` は、マウント時の `reveal` が真だったときに1回だけ呼ぶ（呼び出し元が「もう見せた」を覚える口）。
 * 「書き上げる演出の速さ」もマウント時の値だけを見る（速さを変えても、出している最中の演出は前の速さのまま進み切る）。
 * `revealing` は塊を出している最中か。マウント時の `reveal` が真なら真で始まり、出し切るか演出しないと決まったら偽になる。
 * `readMotion` はマウントした時点で1回だけ呼ぶ。
 */
export function useReportReveal(
  reveal: boolean,
  onPlayed: () => void,
  popClassName: string,
  readMotion: () => RevealMotion,
): { readonly rootRef: RefObject<HTMLDivElement | null>; readonly revealing: boolean } {
  const rootRef = useRef<HTMLDivElement>(null)
  const played = useEffectEvent(onPlayed)
  const [revealOnMount] = useState(reveal)
  const [{ revealSpeed, reducedMotion }] = useState(readMotion)
  const [revealing, setRevealing] = useState(reveal)
  // 同じ本文を二度出さない。
  // `<Activity mode="hidden">` は部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // 描画の前に走る `useBeforePaintSync` でなければならない。描画のあとに走る同期だと、隠す前の本文が1フレームだけ全部見えてしまう。
  // 依存はマウント時に決まったきり変わらない。
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
      reducedMotion
    ) {
      setRevealing(false)
      return undefined
    }
    revealedOnce.current = true
    return startPop(root, {
      intervalMs: popIntervalOf(revealSpeed),
      popClassName,
      onFinish: () => setRevealing(false),
    })
  }, [revealOnMount, revealSpeed, reducedMotion, popClassName])

  return { rootRef, revealing }
}
