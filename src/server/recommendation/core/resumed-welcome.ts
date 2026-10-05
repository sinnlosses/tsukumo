// 続きから起こした代の迎え方を、組み直した履歴から決める。
// 履歴は会話の中身そのものなので、見るのは依頼の有無と最後の時刻だけにし、文面は戻り値に入れない。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  awayBandOf,
  START_VISIT,
  UNKNOWN_AWAY_BAND,
  type WelcomeVisit,
} from "./welcome-greeting.ts"

/**
 * 組み直した依頼があれば、前回からの経過の帯を持つ続きからの迎え方。無ければ新しく始めるのと同じ迎え方。
 * `now` は今のエポックミリ秒。前回の最後の時刻は `restored-turn-span` の `finishedAt`。
 */
export function resumedWelcome(restored: readonly SessionEvent[], now: number): WelcomeVisit {
  if (!restored.some((event) => event.kind === "request")) {
    return START_VISIT
  }
  const span = restored.findLast((event) => event.kind === "restored-turn-span")
  return {
    kind: "resume",
    away:
      span?.kind === "restored-turn-span" ? awayBandOf(now - span.finishedAt) : UNKNOWN_AWAY_BAND,
  }
}
