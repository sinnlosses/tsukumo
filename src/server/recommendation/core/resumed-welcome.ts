// 続きから起こした代の迎え方を、組み直した履歴から決める。
// 履歴は会話の中身そのものなので、見るのは待ちの一言の有無と最後の時刻だけにし、文面は戻り値に入れない。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { type AwayBand, awayBandOf, UNKNOWN_AWAY_BAND } from "./welcome-greeting.ts"

/**
 * - `none`: 組み直した依頼が無い（迎えない）
 * - `waiting-line`: 前回の最後のターンで本体が書いた待ちの一言があり、画面がそれを出すので書かせない
 * - `write`: 中身に触れないおかえりを書かせる。`away` は前回からの経過の帯
 */
export type ResumedWelcome =
  | { readonly kind: "none" }
  | { readonly kind: "waiting-line" }
  | { readonly kind: "write"; readonly away: AwayBand }

/** `now` は今のエポックミリ秒。前回の最後の時刻は `restored-turn-span` の `finishedAt`。 */
export function resumedWelcome(restored: readonly SessionEvent[], now: number): ResumedWelcome {
  const lastRequest = restored.findLastIndex((event) => event.kind === "request")
  if (lastRequest === -1) {
    return { kind: "none" }
  }
  const lastReport = restored.slice(lastRequest + 1).findLast((event) => event.kind === "report")
  if (lastReport?.kind === "report" && lastReport.waitingLine.kind === "speech") {
    return { kind: "waiting-line" }
  }
  const span = restored.findLast((event) => event.kind === "restored-turn-span")
  return {
    kind: "write",
    away:
      span?.kind === "restored-turn-span" ? awayBandOf(now - span.finishedAt) : UNKNOWN_AWAY_BAND,
  }
}
