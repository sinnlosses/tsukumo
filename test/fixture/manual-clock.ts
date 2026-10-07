// 手で進める時計。実際の時間を待たずに、時計に掛けた起こしの間隔を越えるために使う。

import type { TaskSummaryClock } from "../../src/server/repository/adapter/task-summary.ts"

export type ManualClock = {
  readonly clock: TaskSummaryClock
  /** いまの時刻（ミリ秒。0 から始まる）。 */
  readonly now: () => number
  /** 時刻を `ms` 進め、そのあいだに来た起こしを時刻の順に呼ぶ（起こしが掛けた起こしも含む）。 */
  readonly advance: (ms: number) => void
  /** まだ呼んでいない起こしの数。 */
  readonly pending: () => number
}

type ManualTimer = { readonly at: number; readonly wake: () => void; readonly id: number }

export function createManualClock(): ManualClock {
  let now = 0
  let timers: readonly ManualTimer[] = []
  let nextId = 0
  const remove = (id: number): void => {
    timers = timers.filter((timer) => timer.id !== id)
  }
  return {
    clock: {
      after: (delayMs, wake) => {
        const id = nextId
        nextId += 1
        timers = [...timers, { at: now + delayMs, wake, id }]
        return () => {
          remove(id)
        }
      },
    },
    now: () => now,
    advance: (ms) => {
      const until = now + ms
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= until)
          .toSorted((left, right) => left.at - right.at)[0]
        if (due === undefined) {
          break
        }
        remove(due.id)
        now = due.at
        due.wake()
      }
      now = until
    },
    pending: () => timers.length,
  }
}
