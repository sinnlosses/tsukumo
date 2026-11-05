// 書いている途中のレポート（草稿）の器で、届いた塊にだけ一度ポンの class を付ける。
// 塊は欄の入れ物（`data-report-region`）の直の子。器が見たことのある要素は覚えておき、描き直しで残った要素には付け直さない。
// 動きを減らす設定と演出の速さ「切る」では何も付けず、待ちの罫線も出さない（見るのはマウントした時点の値だけ）。

import { useRef, useState, type RefObject } from "react"

import { loadRevealSpeed } from "../../../../../../domain/reveal-speed.ts"
import { prefersReducedMotion } from "../../../../../../domain/reveal/reduced-motion.ts"
import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"
import { playClassOnce } from "../../../../../../utils/play-class-once.ts"

const DRAFT_BLOCK_SELECTOR = "[data-report-region] > *"

/**
 * 草稿の器に付ける ref と、ポンと待ちの罫線を出すか（`motion`）を返す。
 * `arrivals` は届いた部品の並びで、変わるたびに器の中の新しい塊を探す。
 */
export function useDraftPop(
  arrivals: readonly unknown[],
  popClassName: string,
): { readonly ref: RefObject<HTMLElement | null>; readonly motion: boolean } {
  const ref = useRef<HTMLElement>(null)
  const seen = useRef(new WeakSet<Element>())
  const [motion] = useState(
    () => loadRevealSpeed() !== "off" && !prefersReducedMotion((query) => window.matchMedia(query)),
  )

  // 描画の前に付けないと、届いた塊が1フレームだけ止まった形で見えてしまう。
  useBeforePaintSync(() => {
    const root = ref.current
    if (!motion || root === null || arrivals.length === 0) {
      return
    }
    const arrived = [...root.querySelectorAll(DRAFT_BLOCK_SELECTOR)].filter(
      (block) => !seen.current.has(block),
    )
    for (const block of arrived) {
      seen.current.add(block)
      playClassOnce(block, popClassName)
    }
  }, [arrivals, motion, popClassName])

  return { ref, motion }
}
