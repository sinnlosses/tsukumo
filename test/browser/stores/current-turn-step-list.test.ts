// 導出（`currentTurnSteps`）を記録1つにつき1回だけ畳んでいること。`useSession` のセレクタは
// ここを通るので、同じ姿から毎回違う値が返ると描き直しが止まらなくなる。

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useCurrentTurnSteps } from "../../../src/browser/stores/current-turn-step-list.ts"
import { requestRecord, toolRecord } from "../../fixture/session-record.ts"
import { putSession, stateWith } from "../session-store.ts"

afterEach(() => {
  cleanup()
})

describe("useCurrentTurnSteps", () => {
  it("同じ記録・同じ終わり方なら、描き直しても覚えておいた同じものを返す", () => {
    const records = [requestRecord(), toolRecord({ toolUseId: "toolu_a" })]
    putSession(stateWith({ records }))
    const { result, rerender } = renderHook(() => useCurrentTurnSteps())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it("セッションが終わっているかで結果が分かれる（終わっていれば実行中の手順を落とす）", () => {
    const records = [requestRecord(), toolRecord({ toolUseId: "toolu_running" })]

    putSession(stateWith({ records }))
    const live = renderHook(() => useCurrentTurnSteps()).result.current
    putSession(stateWith({ records, endedReason: "架空の終わり" }))
    const ended = renderHook(() => useCurrentTurnSteps()).result.current

    expect(live).toMatchObject({ steps: [{ toolUseId: "toolu_running" }] })
    expect(ended).toMatchObject({ steps: [] })
  })
})
