// 画面の1秒の時計。購読者がいるあいだだけ `setInterval` を1本立て、次の秒の境目から刻む。

import { useEffect, useState } from "react"

import { nowEpochMilliseconds } from "../utils/clock.ts"

const TICK_INTERVAL_MS = 1000

type ClockListener = (now: number) => void

const listeners = new Set<ClockListener>()

let alignTimer: ReturnType<typeof setTimeout> | undefined
let tickTimer: ReturnType<typeof setInterval> | undefined

/** `active` のあいだだけ1秒ごとに刻む、いまの時刻（エポックミリ秒）。止まっているあいだは最後に刻んだ値のまま。 */
export function useNowWhile(active: boolean): number {
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useEffect(() => {
    if (!active) {
      return undefined
    }
    return subscribeClock(setNow)
  }, [active])

  return now
}

/** 刻みを受け取る。戻り値で購読をやめ、最後の購読者がやめると時計も止まる。 */
export function subscribeClock(listener: ClockListener): () => void {
  listeners.add(listener)
  if (alignTimer === undefined && tickTimer === undefined) {
    start()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stop()
    }
  }
}

function start(): void {
  const untilNextSecond = TICK_INTERVAL_MS - (nowEpochMilliseconds() % TICK_INTERVAL_MS)
  alignTimer = setTimeout(() => {
    alignTimer = undefined
    tickTimer = setInterval(tick, TICK_INTERVAL_MS)
    tick()
  }, untilNextSecond)
}

function stop(): void {
  clearTimeout(alignTimer)
  clearInterval(tickTimer)
  alignTimer = undefined
  tickTimer = undefined
}

function tick(): void {
  const now = nowEpochMilliseconds()
  for (const listener of listeners) {
    listener(now)
  }
}
