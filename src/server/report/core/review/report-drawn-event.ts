// 描いた `report` の後ろに続けて出すイベントと、描く `report` の整え方。

import type { ReportCalledEvent, SessionEvent } from "../../../../shared/session/session-event.ts"

/** 描いた `report` が段 `count` の条に当てはまっていたときの記録。当てはまらなければ何も出さない。 */
export function countedRecord(
  report: ReportCalledEvent,
  reasons: readonly string[],
): readonly SessionEvent[] {
  return reasons.length === 0
    ? []
    : [
        {
          kind: "report-counted",
          reasons,
          argumentChars: report.argumentChars,
          inheritedFields: report.inheritedFields,
        },
      ]
}

/** 描いた `report` の締めのセリフ。`closing` を持たなかったころの呼び出しには無い。 */
export function closingSpeech(report: ReportCalledEvent): readonly SessionEvent[] {
  return report.closing.kind === "speech" ? [report.closing] : []
}

/** `report` の `components` から、捨てた部品（ID で指す）を除く。捨てた部品が無ければそのまま返す。 */
export function withoutDroppedParts(
  report: ReportCalledEvent,
  ids: readonly string[],
): ReportCalledEvent {
  return ids.length === 0
    ? report
    : { ...report, components: report.components.filter((part) => !ids.includes(part.id)) }
}
