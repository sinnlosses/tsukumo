import { mainViewTurns } from "../../src/browser/domain/main-view/main-view.ts"
import { parseReportBody } from "../../src/shared/report/body-fence.ts"
import type { ReportBlockSection } from "../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../src/shared/report/report-task.ts"
import { mainViewEntries } from "../../src/shared/session/main-view-entry.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"
import type { TurnBodies } from "../../src/shared/session/turn-progress.ts"
import { reportOf } from "./main-view-entry.ts"
import { reportOfDrawn } from "./report-event.ts"
import { requestEvent } from "./session-event.ts"

export const fold = (events: readonly SessionEvent[]) =>
  events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
export const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies, closed: boolean) =>
  mainViewTurns(mainViewEntries(fold(events)), unsettled, closed).at(-1)
export const ask = requestEvent()
export const utteranceEvent = (markdown: string): SessionEvent => ({
  kind: "utterance",
  text: markdown,
})
export const report = (
  conclusion: string,
  body = "",
  favor = "",
  checks: readonly ReportCheck[] = [],
  task: ReportTask = { kind: "none" },
): SessionEvent =>
  reportOfDrawn({
    toolUseId: "toolu_r1",
    conclusion,
    sections: sectionsOfBody(body),
    favor,
    checks,
    task,
  })

function sectionsOfBody(body: string): readonly ReportBlockSection[] {
  const { blocks } = parseReportBody(body)
  return blocks.length === 0 ? [] : [{ heading: "", blocks }]
}

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
