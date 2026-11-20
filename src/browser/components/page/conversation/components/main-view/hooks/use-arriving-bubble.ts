// 届いたばかりの声の吹き出しに付ける出方。
// 窓が過ぎた瞬間には何のイベントも来ないので、窓の終わりに1回だけ描き直して外す。
// 動きを減らす設定ではいつも「無い」を返す。

import { useState } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { prefersReducedMotionNow } from "../../../../../../stores/gear-preference-seed.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import {
  arrivingBubbleOf,
  arrivingBubbleRemainingMs,
  NO_ARRIVING_BUBBLE,
  type ArrivingBubble,
} from "../../../domain/speech-arrival.ts"
import { useSpeechArrival } from "../../../stores/speech-arrival.ts"

export function useArrivingBubble(): ArrivingBubble {
  const arrival = useSpeechArrival((state) => state.arrival)
  const [reducedMotion] = useState(prefersReducedMotionNow)
  const [now, setNow] = useState(() => nowEpochMilliseconds())
  useExternalSync(() => {
    if (arrival.kind === "none") {
      return undefined
    }
    const at = nowEpochMilliseconds()
    setNow(at)
    const remaining = arrivingBubbleRemainingMs(arrival, at)
    if (remaining <= 0) {
      return undefined
    }
    const timer = setTimeout(() => {
      setNow(nowEpochMilliseconds())
    }, remaining)
    return () => {
      clearTimeout(timer)
    }
  }, [arrival])
  return reducedMotion ? NO_ARRIVING_BUBBLE : arrivingBubbleOf(arrival, now)
}
