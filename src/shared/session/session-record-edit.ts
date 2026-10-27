// セッションの記録（`SessionRecord`）を積む・整える関数。

import { isDeepEqual } from "remeda"

import type { ReportChangeSummary } from "../report/report-change-summary.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { SessionEvent } from "./session-event.ts"
import { MAX_SESSION_STATE_TURNS, type SessionRecord } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import { splitIntoTurns } from "./turn.ts"
import { currentWorkPlan, nextWorkPlan, type WorkPlanEvent } from "./work-plan-fold.ts"

/**
 * 委譲の返却か `report` 1件で積む記録。記録から畳んだ今のワークプランを {@link nextWorkPlan} で畳み、変わったときだけそのワークプランを届いた時刻で1件積む。
 */
export function workPlanRecords(
  records: readonly SessionRecord[],
  event: Extract<WorkPlanEvent, { readonly kind: "delegate-returned" | "report" }>,
  at: number,
): readonly SessionRecord[] {
  const current = currentWorkPlan(records)
  const next = nextWorkPlan(current, event)
  return next.kind === "none" || isDeepEqual(next, current)
    ? []
    : [{ ...next, kind: "work-plan", time: { kind: "stamped", at } }]
}

/** 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。 */
export function settleUtterance(state: SessionState): SessionState {
  if (isBlankText(state.partialUtterance)) {
    return { ...state, partialUtterance: "" }
  }

  return {
    ...state,
    records: [...state.records, { kind: "detail", markdown: state.partialUtterance }],
    partialUtterance: "",
  }
}

/** 同じ `toolUseId` の `report` の記録の変更の札を数に差し替える。記録の窓に無ければ姿を変えない。 */
export function withReportChangeSummary(
  state: SessionState,
  event: Extract<SessionEvent, { readonly kind: "report-change-summary" }>,
): SessionState {
  if (!state.records.some((record) => isReportOf(record, event.toolUseId))) {
    return state
  }
  const changeSummary = {
    kind: "counted",
    changed: event.changed,
    files: event.files,
    added: event.added,
    removed: event.removed,
    mixed: event.mixed,
  } as const satisfies ReportChangeSummary
  return {
    ...state,
    records: state.records.map((record) =>
      isReportOf(record, event.toolUseId) ? { ...record, changeSummary } : record,
    ),
  }
}

/**
 * 直近何ターンぶんだけを残す。ターンの境目は `request`（{@link splitIntoTurns}）なので、古いターンから数えて窓の外に出たものをまとめて落とす。
 * 窓の広さは `chatMode` で選ぶ（{@link MAX_SESSION_STATE_TURNS}）。
 * 依頼より前の記録はターンに数えず、窓を超えて古いターンを落とすときに一緒に落とす。
 */
export function trimToRecentTurns(
  records: readonly SessionRecord[],
  chatMode: boolean,
): readonly SessionRecord[] {
  const limit = chatMode ? MAX_SESSION_STATE_TURNS.chat : MAX_SESSION_STATE_TURNS.work
  const turns = splitIntoTurns(records).flatMap((turn) =>
    turn.kind === "pre-request" ? [] : [turn],
  )
  if (turns.length <= limit) {
    return records
  }

  return turns.slice(-limit).flatMap((turn) => [turn.request, ...turn.records])
}

function isReportOf(
  record: SessionRecord,
  toolUseId: string,
): record is Extract<SessionRecord, { readonly kind: "report" }> {
  return record.kind === "report" && record.toolUseId === toolUseId
}
