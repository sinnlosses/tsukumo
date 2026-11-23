// 姿の差から、会話で新しく指された地図の箱の ID（`{{map: <ID>}}` の印）を届いた順に導く。

import { parseInlineMarks } from "../../../../../shared/report/inline-mark.ts"
import type { SessionRecord } from "../../../../../shared/session/session-record.ts"
import type { SessionState } from "../../../../../shared/session/session-state.ts"

/**
 * `previous` から `next` へ進んだ間に新しく積まれた記録だけを見て、セリフの本文と
 * レポートの結論・部品の文字列から `map` の印の ID を返す。記録が縮んだときは空。
 */
export function pointedBoxIdsBetween(
  previous: SessionState,
  next: SessionState,
): readonly string[] {
  if (next.records.length < previous.records.length) {
    return []
  }
  return next.records.slice(previous.records.length).flatMap(recordTexts).flatMap(mapIdsIn)
}

function recordTexts(record: SessionRecord): readonly string[] {
  switch (record.kind) {
    case "speech":
      return [record.text]
    case "report":
      return [record.conclusion, ...stringValues(record.components)]
    default:
      return []
  }
}

/** 入れ子の値の中の文字列を、出てくる順に集める。 */
function stringValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringValues)
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(stringValues)
  }
  return []
}

function mapIdsIn(text: string): readonly string[] {
  return parseInlineMarks(text).flatMap((segment) =>
    segment.kind === "mark" && segment.mark.kind === "map" ? [segment.mark.id] : [],
  )
}
