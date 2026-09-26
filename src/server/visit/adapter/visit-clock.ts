// 訪問の見張りに渡す時計（`VisitClock`）。時計を回すのは
// ここだけで、いつ起こすかの判断は core の純関数（`visitArrival`）が持つ。
//
// 起こしは `unref()` する——訪問は待ちのあいだの添え物なので、掛けた時計がプロセスの終わりを
// 引き止めない（`main` のタスク一覧の見回りと同じ扱い）。

import { type VisitClock } from "../core/visit-watch.ts"

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
