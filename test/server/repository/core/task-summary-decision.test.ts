import { describe, expect, it } from "vitest"

import {
  decideTaskSummaryPoll,
  type TaskSummaryPollState,
} from "../../../../src/server/repository/core/task-summary-decision.ts"
import type { TaskSummaryResult } from "../../../../src/shared/repository/task-summary.ts"

const KNOWN: TaskSummaryResult = { kind: "known", items: [], omittedClosedCount: 0 }
const UNKNOWN: TaskSummaryResult = { kind: "unknown" }
const LOADING: TaskSummaryResult = { kind: "loading" }

function stateOf(overrides: Partial<TaskSummaryPollState> = {}): TaskSummaryPollState {
  return { notified: LOADING, shownFromMemory: undefined, failureStreak: 0, ...overrides }
}

describe("decideTaskSummaryPoll", () => {
  it("最初に読めた結果は知らせ、知らせた結果を覚える", () => {
    const decision = decideTaskSummaryPoll(stateOf(), { kind: "read", result: KNOWN })
    expect(decision.deliver).toEqual(KNOWN)
    expect(decision.state.notified).toEqual(KNOWN)
  })

  it("前回と同じ結果は知らせない", () => {
    const decision = decideTaskSummaryPoll(stateOf({ notified: KNOWN }), {
      kind: "read",
      result: KNOWN,
    })
    expect(decision.deliver).toBeUndefined()
  })

  it("何も知らせていないうちの unchanged は「不明」で知らせ、失敗に数える", () => {
    const decision = decideTaskSummaryPoll(stateOf(), { kind: "unchanged" })
    expect(decision.deliver).toEqual(UNKNOWN)
    expect(decision.state.failureStreak).toBe(1)
  })

  it("知らせたあとの unchanged は何もしない", () => {
    const decision = decideTaskSummaryPoll(stateOf({ notified: KNOWN }), { kind: "unchanged" })
    expect(decision.deliver).toBeUndefined()
    expect(decision.state.failureStreak).toBe(0)
  })

  it("一覧を出していれば、読めなかった回は3回続くまで握りつぶす", () => {
    const first = decideTaskSummaryPoll(stateOf({ notified: KNOWN }), {
      kind: "read",
      result: UNKNOWN,
    })
    const second = decideTaskSummaryPoll(first.state, { kind: "read", result: UNKNOWN })
    const third = decideTaskSummaryPoll(second.state, { kind: "read", result: UNKNOWN })
    expect([first.deliver, second.deliver]).toEqual([undefined, undefined])
    expect(third.deliver).toEqual(UNKNOWN)
  })

  it("読めた回で失敗の連続を数え直す", () => {
    const decision = decideTaskSummaryPoll(stateOf({ notified: KNOWN, failureStreak: 2 }), {
      kind: "read",
      result: KNOWN,
    })
    expect(decision.state.failureStreak).toBe(0)
  })

  it("覚えた一覧を出していても、読めなかった回を握りつぶす", () => {
    const decision = decideTaskSummaryPoll(stateOf({ shownFromMemory: KNOWN }), {
      kind: "read",
      result: UNKNOWN,
    })
    expect(decision.deliver).toBeUndefined()
  })

  it("覚えた一覧と同じ結果は知らせず、覚えを手放す", () => {
    const decision = decideTaskSummaryPoll(stateOf({ shownFromMemory: KNOWN }), {
      kind: "read",
      result: KNOWN,
    })
    expect(decision.deliver).toBeUndefined()
    expect(decision.state).toEqual(stateOf({ notified: KNOWN }))
  })
})
