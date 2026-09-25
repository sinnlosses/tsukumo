// 訪問の見張りに渡す時計（`src/server/visit/core/visit-watch.ts` の `VisitClock`）。**時計を回すのは
// ここだけ**で、いつ起こすかの判断は core の純関数（`visit-timing.ts`）が持つ。
//
// 起こしは `unref()` する——訪問は待ちのあいだの添え物なので、掛けた時計がプロセスの終わりを
// 引き止めない（`task-summary.ts` の見回りと同じ扱い）。

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
