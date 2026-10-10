// やり取り1件の始まりと終わりの時刻と、引き出しの「やり取り」の行の2行目に出す、開始の時刻と所要の字。
//
// 始まりは依頼の記録の時刻、終わりはそのやり取りの依頼より後の記録のうち時刻を持つもののいちばん遅い時刻。
// 前のセッションから読み戻して時刻の分からない記録（`restored`）は数えない。

import {
  recordTimeAt,
  type RecordTime,
  type SessionRecord,
} from "../../../../../../../shared/session/session-state.ts"
import { splitIntoTurns, turnIdOf } from "../../../../../../../shared/session/turn.ts"
import { clockTime, zonedDateTime } from "../../../../../../utils/clock.ts"

/**
 * やり取り1件の時刻。
 * - `unknown`: 始まりが分からない（依頼より前の記録・時刻の分からない依頼）
 * - `started`: 始まりだけ分かる（依頼のあとに時刻を持つ記録がまだ無い）
 * - `spanned`: 始まりと終わりが分かる
 */
export type TurnSpan =
  | { readonly kind: "unknown" }
  | { readonly kind: "started"; readonly startedAt: number }
  | { readonly kind: "spanned"; readonly startedAt: number; readonly endedAt: number }

const UNKNOWN_SPAN: TurnSpan = { kind: "unknown" }

/** 時刻と所要のあいだの全角の空白（見本の字組み）。 */
const SPAN_SEPARATOR = "　"

const MINUTE_SECONDS = 60
const HOUR_SECONDS = 60 * MINUTE_SECONDS

/** 記録をやり取りに割り、やり取りの通し番号ごとの時刻を返す。 */
export function turnSpans(records: readonly SessionRecord[]): ReadonlyMap<number, TurnSpan> {
  return new Map(
    splitIntoTurns(records).map((turn) => [
      turnIdOf(turn),
      turn.kind === "request" ? spanOf(turn.request.time, turn.records) : UNKNOWN_SPAN,
    ]),
  )
}

/** 引き出しの「やり取り」の行の2行目（「19:10」と「6分」を全角の空白でつなぐ）。始まりが分からなければ空。 */
export function turnSpanLabel(span: TurnSpan, timeZone: string): string {
  switch (span.kind) {
    case "unknown":
      return ""
    case "started":
      return clockTime(zonedDateTime(span.startedAt, timeZone))
    case "spanned":
      return `${clockTime(zonedDateTime(span.startedAt, timeZone))}${SPAN_SEPARATOR}${coarseDuration(span.endedAt - span.startedAt)}`
  }
}

/** 所要を見本の粒度で読む字にする（60秒未満は「N秒」、1時間未満は「N分」、それ以上は「H時間M分」）。 */
function coarseDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < MINUTE_SECONDS) {
    return `${String(seconds)}秒`
  }
  if (seconds < HOUR_SECONDS) {
    return `${String(Math.floor(seconds / MINUTE_SECONDS))}分`
  }
  const hours = Math.floor(seconds / HOUR_SECONDS)
  const minutes = Math.floor((seconds % HOUR_SECONDS) / MINUTE_SECONDS)
  return `${String(hours)}時間${String(minutes)}分`
}

function spanOf(requestTime: RecordTime, records: readonly SessionRecord[]): TurnSpan {
  const startedAt = recordTimeAt(requestTime)
  if (startedAt === undefined) {
    return UNKNOWN_SPAN
  }
  const times = records.flatMap(recordTimes).flatMap((time) => {
    const at = recordTimeAt(time)
    return at === undefined ? [] : [at]
  })
  return times.length === 0
    ? { kind: "started", startedAt }
    : { kind: "spanned", startedAt, endedAt: Math.max(...times) }
}

/** 記録1件が持つ時刻。ツールは始まりと、終わっていれば終わり（背景で走らせたものは完了の知らせ）。 */
function recordTimes(record: SessionRecord): readonly RecordTime[] {
  switch (record.kind) {
    case "request":
    case "aside":
    case "report":
    case "work-plan":
    case "speech":
      return [record.time]
    case "tool":
      return [
        record.startedAt,
        ...(record.status.kind === "finished" ? [record.status.finishedAt] : []),
        ...(record.backgroundEnd.kind === "notified" ? [record.backgroundEnd.at] : []),
      ]
    case "detail":
    case "question":
    case "compact-boundary":
    case "usage-review-result":
    case "turn-failure":
      return []
  }
}
