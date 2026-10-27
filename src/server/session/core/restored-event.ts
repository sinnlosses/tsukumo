// 前のセッションから組み直した出来事（`RestoredEvent`）を畳み、積まれた記録の時刻を写し替える。

import { advanceSessionState } from "../../../shared/session/session-advance.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import type { RecordTime, SessionRecord } from "../../../shared/session/session-record.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"

/**
 * 組み直した出来事を順に畳む。出来事に transcript の時刻があればその時刻で、無ければ直前に読めた時刻（まだ無ければ `now`）で畳む。
 * 畳んで新しく積まれた・書き換わった記録と、新しく積まれたセリフ（`speeches`）の `stamped` は、読めた出来事なら `recovered`、読めなかった出来事なら `restored` に写し替える。
 * 反応の記録（`reaction`）は積まない（組み直した記録に、流し直した時刻の反応を残さない）。
 */
export function applyRestoredEvents(
  state: SessionState,
  events: readonly Pick<RestoredEvent, "event" | "time">[],
  now: number,
): SessionState {
  return events.reduce(
    (fold, restored) => {
      const at = restored.time.kind === "known" ? restored.time.at : fold.at
      const before = new Set(fold.state.records)
      const speechesBefore = new Set(fold.state.speeches)
      const next = advanceSessionState(fold.state, restored.event, at)
      const restoreTime = (time: RecordTime): RecordTime =>
        time.kind !== "stamped"
          ? time
          : restored.time.kind === "known"
            ? { kind: "recovered", at: time.at }
            : { kind: "restored" }
      return {
        at,
        state: {
          ...next,
          records: next.records.map((record) =>
            before.has(record) ? record : mapRecordTimes(record, restoreTime),
          ),
          speeches: next.speeches.map((speech) =>
            speechesBefore.has(speech) ? speech : { ...speech, time: restoreTime(speech.time) },
          ),
        },
      }
    },
    { at: now, state },
  ).state
}

/**
 * 記録が持つ時刻（{@link RecordTime}）をすべて `map` で写し替える。時刻を持たない種類はそのまま。
 * ツールは `startedAt` と、終わっていれば `status.finishedAt`、完了の知らせが届いていれば `backgroundEnd.at`。
 */
function mapRecordTimes(
  record: SessionRecord,
  map: (time: RecordTime) => RecordTime,
): SessionRecord {
  if (
    record.kind === "request" ||
    record.kind === "aside" ||
    record.kind === "speech" ||
    record.kind === "reaction" ||
    record.kind === "work-plan" ||
    record.kind === "report"
  ) {
    return { ...record, time: map(record.time) }
  }
  if (record.kind === "tool") {
    return {
      ...record,
      startedAt: map(record.startedAt),
      status:
        record.status.kind === "finished"
          ? { ...record.status, finishedAt: map(record.status.finishedAt) }
          : record.status,
      backgroundEnd:
        record.backgroundEnd.kind === "notified"
          ? { kind: "notified", at: map(record.backgroundEnd.at) }
          : record.backgroundEnd,
    }
  }
  return record
}
