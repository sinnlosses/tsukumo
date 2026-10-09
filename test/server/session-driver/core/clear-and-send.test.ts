import { describe, expect, it } from "vitest"

import { createClearAndSend } from "../../../../src/server/session-driver/core/clear-and-send.ts"
import type { TurnOutcome } from "../../../../src/shared/session-driver/turn-failure.ts"

const COMPLETED: TurnOutcome = { kind: "completed" }

describe("createClearAndSend", () => {
  it("預けて成功で終わると、/clear と文面がこの順に返る", () => {
    const clearAndSend = createClearAndSend()
    clearAndSend.hold("次の依頼")

    expect(clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })).toEqual([
      "/clear",
      "次の依頼",
    ])
  })

  it("返したあとは預かりが空になり、続くターンの終わりでは何も返らない", () => {
    const clearAndSend = createClearAndSend()
    clearAndSend.hold("次の依頼")
    clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })

    expect(clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })).toEqual([])
  })

  it("預けていなければ何も返らない", () => {
    expect(createClearAndSend().take({ outcome: COMPLETED, pendingCount: 0 })).toEqual([])
  })

  it.each<[string, TurnOutcome, number]>([
    ["中断", { kind: "interrupted" }, 0],
    ["失敗", { kind: "failed", cause: { kind: "api-error" } }, 0],
    ["答え待ちが残っている", COMPLETED, 1],
  ])("%sでは何も返らず、預かりも捨てる", (_name, outcome, pendingCount) => {
    const clearAndSend = createClearAndSend()
    clearAndSend.hold("次の依頼")

    expect(clearAndSend.take({ outcome, pendingCount })).toEqual([])
    expect(clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })).toEqual([])
  })

  it("利用者の依頼などで捨てると何も返らない", () => {
    const clearAndSend = createClearAndSend()
    clearAndSend.hold("次の依頼")
    clearAndSend.discard()

    expect(clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })).toEqual([])
  })

  it("2回預けると後のほうに置き換わる", () => {
    const clearAndSend = createClearAndSend()
    clearAndSend.hold("前")
    clearAndSend.hold("後")

    expect(clearAndSend.take({ outcome: COMPLETED, pendingCount: 0 })).toEqual(["/clear", "後"])
  })
})
