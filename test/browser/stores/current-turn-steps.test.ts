// 導出（`currentTurnSteps`）を記録1つにつき1回だけ畳んでいること。`useSession` のセレクタは
// ここを通るので、同じ姿から毎回違う値が返ると描き直しが止まらなくなる。

import { describe, expect, it } from "vitest"

import { currentTurnStepsOf } from "../../../src/browser/stores/current-turn-steps.ts"
import { requestRecord, toolRecord } from "../../fixture/session-record.ts"

describe("currentTurnStepsOf", () => {
  it("同じ記録・同じ終わり方なら、覚えておいた同じものを返す", () => {
    const records = [requestRecord(), toolRecord({ toolUseId: "toolu_a" })]

    expect(currentTurnStepsOf(records, false)).toBe(currentTurnStepsOf(records, false))
    expect(currentTurnStepsOf(records, true)).toBe(currentTurnStepsOf(records, true))
  })

  it("セッションが終わっているかで結果が分かれる（終わっていれば実行中の手順を落とす）", () => {
    const records = [requestRecord(), toolRecord({ toolUseId: "toolu_running" })]

    expect(currentTurnStepsOf(records, false)).toMatchObject({
      steps: [{ toolUseId: "toolu_running" }],
    })
    expect(currentTurnStepsOf(records, true)).toMatchObject({ steps: [] })
  })

  it("記録が変わったら計算し直す", () => {
    const before = [requestRecord(), toolRecord({ toolUseId: "toolu_a" })]
    const after = [...before, toolRecord({ toolUseId: "toolu_b" })]

    expect(currentTurnStepsOf(before, false)).toMatchObject({ steps: [{ toolUseId: "toolu_a" }] })
    expect(currentTurnStepsOf(after, false)).toMatchObject({
      steps: [{ toolUseId: "toolu_a" }, { toolUseId: "toolu_b" }],
    })
  })
})
