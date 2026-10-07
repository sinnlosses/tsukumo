import { describe, expect, it } from "vitest"

import { resumedWelcome } from "../../../../src/server/recommendation/core/resumed-welcome.ts"
import type {
  ReportWaitingLine,
  RestoredEvent,
  SessionEvent,
} from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { knownRestored, unknownRestored } from "../../../fixture/restored-event.ts"

// すべて手で書いた架空の履歴。

const NOW = 1_800_000_000_000
const HOUR_MS = 3_600_000

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const WAITING_LINE = {
  kind: "speech",
  text: "架空の待ちの一言",
  expression: "default",
} as const satisfies ReportWaitingLine

function report(waitingLine: ReportWaitingLine): SessionEvent {
  return reportEvent({ waitingLine })
}

/** 並びの最後の出来事だけが `at` の時刻を持つ履歴。 */
function endingAt(events: readonly SessionEvent[], at: number): readonly RestoredEvent[] {
  return [...unknownRestored(events.slice(0, -1)), ...knownRestored(events.slice(-1), at)]
}

describe("resumedWelcome", () => {
  it("組み直した依頼があれば、前回の最後の時刻からの経過の帯で続きから迎える", () => {
    expect(
      resumedWelcome(
        endingAt([REQUEST, report({ kind: "none" }), FINISHED], NOW - 2 * HOUR_MS),
        NOW,
      ),
    ).toEqual({ kind: "resume", away: "数時間" })
  })

  it("前回の最後の report に待ちの一言があっても、続きから迎える", () => {
    expect(
      resumedWelcome(endingAt([REQUEST, report(WAITING_LINE), FINISHED], NOW - HOUR_MS), NOW),
    ).toEqual({ kind: "resume", away: "数時間" })
  })

  it("最後の時刻が読めなければ、帯は「分からない」", () => {
    expect(resumedWelcome(unknownRestored([REQUEST, FINISHED]), NOW)).toEqual({
      kind: "resume",
      away: "分からない",
    })
  })

  it("組み直した依頼が無ければ、新しく始めるのと同じに迎える", () => {
    expect(resumedWelcome([], NOW)).toEqual({ kind: "start" })
    expect(
      resumedWelcome(unknownRestored([{ kind: "utterance", text: "架空の本文" }]), NOW),
    ).toEqual({
      kind: "start",
    })
  })
})
