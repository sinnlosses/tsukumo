// 続けて落ちたパックの定着の契機を間引く勘定。
// パックごとに、続けて落ちた回数と残りの飛ばす回数を、プロセスのメモリにだけ持つ（起こし直すと 0 から数え直す）。
// 錠はプロセスをまたぐが、この勘定はプロセスごとに別。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"

/**
 * 続けて落ちた回数が `failuresBeforeBackoff` に届いたら、そのあとの契機を 2 回飛ばす。
 * 落ちるたびに倍にし、`maxSkips` で頭打ちにする。
 */
export const CHAT_CONSOLIDATION_BACKOFF = {
  failuresBeforeBackoff: 3,
  maxSkips: 32,
} as const satisfies Record<string, number>

/**
 * 1回の定着の結果が勘定に効く向き。
 *
 * - `count`: 続けて落ちた回数を1増やし、飛ばす回数を決め直す
 * - `reset`: 0 に戻す
 * - `keep`: 動かさない
 */
export type ChatConsolidationBackoffEffect = "count" | "reset" | "keep"

export type ChatConsolidationBackoff = {
  /** この契機を飛ばすか。飛ばすときは残りの回数を1減らす。 */
  readonly holdsBack: (packName: CharacterPackName) => boolean
  readonly note: (packName: CharacterPackName, effect: ChatConsolidationBackoffEffect) => void
}

type BackoffTally = {
  readonly failures: number
  readonly skipsLeft: number
}

export function createChatConsolidationBackoff(): ChatConsolidationBackoff {
  const tallies = new Map<string, BackoffTally>()
  return {
    holdsBack: (packName) => {
      const tally = tallies.get(packName)
      if (tally === undefined || tally.skipsLeft === 0) {
        return false
      }
      tallies.set(packName, { ...tally, skipsLeft: tally.skipsLeft - 1 })
      return true
    },
    note: (packName, effect) => {
      if (effect === "keep") {
        return
      }
      if (effect === "reset") {
        tallies.delete(packName)
        return
      }
      const failures = (tallies.get(packName)?.failures ?? 0) + 1
      tallies.set(packName, { failures, skipsLeft: skipsAfter(failures) })
    },
  }
}

function skipsAfter(failures: number): number {
  const over = failures - CHAT_CONSOLIDATION_BACKOFF.failuresBeforeBackoff
  if (over < 0) {
    return 0
  }
  return Math.min(2 ** (over + 1), CHAT_CONSOLIDATION_BACKOFF.maxSkips)
}
