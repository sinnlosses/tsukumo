// 定着が続けて失敗したら、このプロセスの間は契機を起こさない勘定。
// 数え方は writer の間引き（`chatConsolidationBackoffEffect`）と同じで、永続させない（起こし直しても残るが、プロセスを替えれば 0 から）。

import {
  CHAT_CONSOLIDATION_BACKOFF,
  chatConsolidationBackoffEffect,
  type ChatConsolidationOutcome,
} from "../../chat/core/chat-consolidation-writer.ts"

export type ConsolidationHalt = {
  /** 止めているか。 */
  readonly isHalted: () => boolean
  /** 結果を数える。この結果で止めたとき（止めた1回だけ）は続けて落ちた回数を返す。 */
  readonly note: (outcome: ChatConsolidationOutcome) => number | undefined
}

export function createConsolidationHalt(): ConsolidationHalt {
  let failures = 0
  let halted = false
  return {
    isHalted: () => halted,
    note: (outcome) => {
      if (halted) {
        return undefined
      }
      const effect = chatConsolidationBackoffEffect(outcome)
      if (effect === "reset") {
        failures = 0
        return undefined
      }
      if (effect === "keep") {
        return undefined
      }
      failures += 1
      if (failures < CHAT_CONSOLIDATION_BACKOFF.failuresBeforeBackoff) {
        return undefined
      }
      halted = true
      return failures
    },
  }
}
