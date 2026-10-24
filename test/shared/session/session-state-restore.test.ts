import { describe, expect, it } from "vitest"

import { applyRestoredEvents } from "../../../src/shared/session/restored-event.ts"
import type { RestoredEvent, SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { requestEvent } from "../../fixture/session-event.ts"

describe("applySessionEvent（答え待ちの届いた時刻）", () => {
  const permission = (
    id: string,
  ): Extract<SessionEvent, { kind: "pending-changed" }>["pending"][number] => ({
    kind: "permission",
    id,
    toolName: "Bash",
    input: {},
  })

  it("届いた答え待ちにイベントの時刻を打ち、2件目が来ても1件目の時刻は変えない", () => {
    const first = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "pending-changed", pending: [permission("toolu_1")] },
      1_000,
    )
    const second = applySessionEvent(
      first,
      { kind: "pending-changed", pending: [permission("toolu_1"), permission("toolu_2")] },
      5_000,
    )

    expect(second.pending.map((ask) => [ask.id, ask.askedAt])).toEqual([
      ["toolu_1", 1_000],
      ["toolu_2", 5_000],
    ])
  })

  it("答えて消えた id の時刻は残さず、同じ id が来直したら新しく打つ", () => {
    const events: readonly (readonly [SessionEvent, number])[] = [
      [{ kind: "pending-changed", pending: [permission("toolu_1")] }, 1_000],
      [{ kind: "pending-changed", pending: [] }, 2_000],
      [{ kind: "pending-changed", pending: [permission("toolu_1")] }, 3_000],
    ]
    const state = events.reduce(
      (view, [event, at]) => applySessionEvent(view, event, at),
      INITIAL_SESSION_STATE,
    )

    expect(state.pending.map((ask) => ask.askedAt)).toEqual([3_000])
  })
})

describe("applyRestoredEvents（transcript の時刻）", () => {
  const known = (event: SessionEvent, at: number): RestoredEvent => ({
    event,
    time: { kind: "known", at },
  })
  const unknown = (event: SessionEvent): RestoredEvent => ({ event, time: { kind: "unknown" } })
  const request = requestEvent()
  const bashStarted: SessionEvent = {
    kind: "tool-started",
    toolUseId: "toolu_1",
    name: "Bash",
    input: { command: "架空の検査" },
    parentToolUseId: undefined,
  }
  const finished: SessionEvent = {
    kind: "tool-finished",
    toolUseId: "toolu_1",
    content: "架空の結果",
    isError: false,
  }
  const toolOf = (state: SessionState) => state.records.find((found) => found.kind === "tool")

  it("時刻の読める出来事から積んだ記録は、その時刻の recovered になる", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [known(request, 1_000), known(bashStarted, 2_000), known(finished, 5_000)],
      99_999,
    )

    expect(state.records[0]).toMatchObject({
      kind: "request",
      time: { kind: "recovered", at: 1_000 },
    })
    expect(toolOf(state)).toMatchObject({
      startedAt: { kind: "recovered", at: 2_000 },
      status: { kind: "finished", finishedAt: { kind: "recovered", at: 5_000 } },
    })
  })

  it("時刻の読めない出来事から積んだ記録は restored のまま、読めた端は recovered で残る", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [unknown(request), known(bashStarted, 2_000), unknown(finished)],
      99_999,
    )

    expect(state.records[0]).toMatchObject({ kind: "request", time: { kind: "restored" } })
    expect(toolOf(state)).toMatchObject({
      startedAt: { kind: "recovered", at: 2_000 },
      status: { kind: "finished", finishedAt: { kind: "restored" } },
    })
  })
})

describe("applyRestoredEvents（state.speeches の時刻）", () => {
  const speak = (text: string): SessionEvent => ({ kind: "speech", text, expression: "default" })

  it("時刻の読めるセリフは recovered、読めないセリフは restored で、記録のセリフと同じ時刻になる", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [
        { event: speak("読めた"), time: { kind: "known", at: 1_000 } },
        { event: speak("読めない"), time: { kind: "unknown" } },
      ],
      99_999,
    )

    expect(state.speeches.map((speech) => speech.time)).toEqual([
      { kind: "recovered", at: 1_000 },
      { kind: "restored" },
    ])
    expect(
      state.records.flatMap((record) => (record.kind === "speech" ? [record.time] : [])),
    ).toEqual(state.speeches.map((speech) => speech.time))
  })

  it("組み直す前から積んであったセリフの時刻は書き換えない（stamped のまま）", () => {
    const live = applySessionEvent(INITIAL_SESSION_STATE, speak("いまのセリフ"), 5_000)
    const state = applyRestoredEvents(
      live,
      [{ event: speak("前のセリフ"), time: { kind: "unknown" } }],
      99_999,
    )

    expect(state.speeches.map((speech) => speech.time)).toEqual([
      { kind: "stamped", at: 5_000 },
      { kind: "restored" },
    ])
  })
})
