// `active` のあいだだけ1秒ごとに刻む、いまの時刻（エポックミリ秒）。止まっているあいだは最後に刻んだ値のまま。

import { useEffect, useState } from "react"

import { nowEpochMilliseconds } from "../utils/clock.ts"

const TICK_INTERVAL_MS = 1000

export function useNowWhile(active: boolean): number {
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useEffect(() => {
    if (!active) {
      return undefined
    }
    const timer = setInterval(() => setNow(nowEpochMilliseconds()), TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [active])

  return now
}
