import { describe, expect, it } from "vitest"

import { resumedWelcome } from "../../../../src/server/recommendation/core/resumed-welcome.ts"
import type {
  ReportWaitingLine,
  SessionEvent,
} from "../../../../src/shared/session/session-event.ts"

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
  return {
    kind: "report",
    toolUseId: "fictional-report",
    conclusion: "架空の結論",
    sections: [],
    favor: "",
    checks: [],
    task: { kind: "none" },
    closing: { kind: "none" },
    waitingLine,
    unknownBlockCount: 0,
    sessionSummary: undefined,
  }
}

function span(finishedAt: number): SessionEvent {
  return { kind: "restored-turn-span", startedAt: finishedAt - 1000, finishedAt }
}

describe("resumedWelcome", () => {
  it("組み直した依頼があれば、前回の最後の時刻からの経過の帯で続きから迎える", () => {
    expect(
      resumedWelcome([REQUEST, report({ kind: "none" }), FINISHED, span(NOW - 2 * HOUR_MS)], NOW),
    ).toEqual({ kind: "resume", away: "数時間" })
  })

  it("前回の最後の report に待ちの一言があっても、続きから迎える", () => {
    expect(
      resumedWelcome([REQUEST, report(WAITING_LINE), FINISHED, span(NOW - HOUR_MS)], NOW),
    ).toEqual({ kind: "resume", away: "数時間" })
  })

  it("最後の時刻が読めなければ、帯は「分からない」", () => {
    expect(resumedWelcome([REQUEST, FINISHED], NOW)).toEqual({
      kind: "resume",
      away: "分からない",
    })
  })

  it("組み直した依頼が無ければ、新しく始めるのと同じに迎える", () => {
    expect(resumedWelcome([], NOW)).toEqual({ kind: "start" })
    expect(resumedWelcome([{ kind: "utterance", text: "架空の本文" }], NOW)).toEqual({
      kind: "start",
    })
  })
})
