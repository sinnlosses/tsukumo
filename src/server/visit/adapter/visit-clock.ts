// 訪問の見張りに渡す時計（`VisitClock`）。時計を回すのはここだけで、いつ起こすかの判断は core が持つ。
//
// 起こしは `unref()` する（訪問は待ちのあいだの添え物なので、掛けた時計がプロセスの終わりを引き止めない）。

import type { VisitClock } from "../core/visit-watch.ts"

export function createVisitClock(): VisitClock {
  return {
    after: (delayMs, wake) => {
      const timer = setTimeout(wake, delayMs)
      timer.unref()
      return () => {
        clearTimeout(timer)
      }
    },
  }
}
