// 記録の時刻（`RecordTime`）に添える時計の字（`HH:MM`。秒は出さない）。

import { type RecordTime, recordTimeAt } from "../../../../../shared/session/session-state.ts"
import {
  clockDateTime,
  clockTime,
  dayAwareClockTime,
  localTimeZoneId,
  zonedDateTime,
} from "../../../../utils/clock.ts"

/**
 * 記録の時刻に添える時計の字。前のセッションを組み直した記録は `unknown` で、何も出さない。
 * 流し直した時刻を代わりに出すと昨日の一言が「いま」に見える。
 */
export type ClockStamp =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly dateTime: string; readonly text: string }

/**
 * {@link recordClockStamp} の字を、`now` と別の日のものなら `M/D HH:MM` にしたもの（`dateTime` は同じ）。
 * 最新の吹き出しの名前の隣のように、日の区切りが無い所で使う。
 */
export function recordClockStampWithDay(time: RecordTime, now: number): ClockStamp {
  const stamp = recordClockStamp(time, localTimeZoneId())
  const at = recordTimeAt(time)
  if (stamp.kind === "unknown" || at === undefined) {
    return stamp
  }
  return { ...stamp, text: dayAwareClockTime(at, now) }
}

export function recordClockStamp(time: RecordTime, timeZone: string): ClockStamp {
  const at = recordTimeAt(time)
  if (at === undefined) {
    return { kind: "unknown" }
  }
  const zoned = zonedDateTime(at, timeZone)
  return { kind: "known", dateTime: clockDateTime(zoned), text: clockTime(zoned) }
}
