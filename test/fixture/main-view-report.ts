import { reportSectionsOfBody } from "../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../src/shared/report/report-task.ts"
import { mainViewEntries } from "../../src/shared/session/main-view-entry.ts"
import { mainViewTurns } from "../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"
import type { TurnBodies } from "../../src/shared/session/turn-progress.ts"
import { reportOf } from "./main-view-entry.ts"
import { reportEvent } from "./report-event.ts"

export const fold = (events: readonly SessionEvent[]) =>
  events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
export const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies, closed: boolean) =>
  mainViewTurns(mainViewEntries(fold(events)), unsettled, closed).at(-1)
export const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
export const text = (markdown: string): SessionEvent => ({ kind: "utterance", text: markdown })
export const report = (
  conclusion: string,
  body = "",
  favor = "",
  checks: readonly ReportCheck[] = [],
  task: ReportTask = { kind: "none" },
): SessionEvent =>
  reportEvent({
    toolUseId: "toolu_r1",
    conclusion,
    sections: reportSectionsOfBody(body),
    favor,
    checks,
    task,
  })
export const toolRun = (id: string): readonly SessionEvent[] => [
  {
    kind: "tool-started",
    toolUseId: id,
    name: "Edit",
    input: { file_path: "/tmp/dummy/a.ts" },
    parentToolUseId: undefined,
  },
  { kind: "tool-finished", toolUseId: id, content: "ok", isError: false },
]
export const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
export const shownReports = (turn: ReturnType<typeof turnOf>) =>
  (turn?.steps ?? []).flatMap((step) => {
    const shown = reportOf(step)
    return shown === undefined ? [] : [shown]
  })
