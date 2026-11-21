import { reportEvents } from "../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../src/shared/session/main-view-shape.ts"
import type { ReportCalledEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "./tool-use-id.ts"

/** 書き手の入り口（`reportEvents`）を通した report の入力を、メインビューの記録まで畳んだ本文。 */
export function regionsOfInput(input: Readonly<Record<string, unknown>>): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), input, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  return regionsOfEvent(event)
}

/** 部品の一覧だけを渡す `regionsOfInput`。 */
export function regionsOfParts(components: readonly unknown[]): MainViewReportRegions {
  return regionsOfInput({ components })
}

/** report のイベントを、初期の状態へ畳んだメインビューの記録の本文。 */
export function regionsOfEvent(event: ReportCalledEvent): MainViewReportRegions {
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}
