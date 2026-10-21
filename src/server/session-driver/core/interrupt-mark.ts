// いまのターンに tsukumo が中断を送ったかの印。
// 下ろすのは、ターンを始める依頼のイベント（`request`・`aside`・`turn-started`・`progress-nudged`）と `turn-finished`。
// 動いていないときに送った中断が、次のターンの終わり方を決めないようにする。

import type { SessionEvent } from "../../../shared/session/session-event.ts"

export type InterruptMark = {
  /** 駆動が中断を送るとき。 */
  readonly send: () => void
  /** 駆動が流すイベントを渡す。 */
  readonly observe: (event: SessionEvent) => void
  /** そのターンに中断を送ったか。 */
  readonly sent: () => boolean
}

/** {@link InterruptMark} を1つ作る。駆動1つに1つ。 */
export function createInterruptMark(): InterruptMark {
  let isSent = false
  return {
    send: () => {
      isSent = true
    },
    observe: (event) => {
      if (
        event.kind === "request" ||
        event.kind === "aside" ||
        event.kind === "turn-started" ||
        event.kind === "progress-nudged" ||
        event.kind === "turn-finished"
      ) {
        isSent = false
      }
    },
    sent: () => isSent,
  }
}
