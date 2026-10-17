import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { usePlanUsage } from "../../../../../../src/browser/components/domain/sidebar/hooks/use-plan-usage.ts"
import type { PlanUsageReport } from "../../../../../../src/shared/plan-usage/plan-usage.ts"
import { notApplicablePlanUsage, readyPlanUsage } from "../../../../../fixture/plan-usage.ts"
import { createTestQueryClient, queryClientWrapper } from "../../../../query-client.tsx"
import { rpcError, rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../rpc-fetch-stub.ts"

/**
 * 「該当しない」が返った間の取り直しの列（2・5・10・20 秒）と、待っている間の見え方・打ち切り・
 * ボタンでの取り直しを測る。時計は偽物で進める。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fetchStub?.restore()
  fetchStub = undefined
})

/** 呼ばれるたびに `replies` の次を返す。尽きたら最後を返し続ける。 */
function stubReports(...replies: readonly PlanUsageReport[]): () => number {
  let calls = 0
  fetchStub = stubRpcFetch(() => {
    const reply = replies[Math.min(calls, replies.length - 1)]
    calls += 1
    return rpcOutput(reply)
  })
  return () => calls
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  // 応答の本文を読む非同期は実時間で落ち着かせる（偽の時計は取り直しの間隔だけ）。
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
  })
}

function renderPlanUsage(finishedTurnCount = 0) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
  return renderHook(({ count }) => usePlanUsage(count), {
    initialProps: { count: finishedTurnCount },
    wrapper: queryClientWrapper(createTestQueryClient()),
  })
}

describe("usePlanUsage の取り直しの列", () => {
  it("「該当しない」のあと値が出たら止まり、ready になる", async () => {
    const callCount = stubReports(notApplicablePlanUsage(), readyPlanUsage())
    const { result } = renderPlanUsage()

    await advance(0)
    expect(callCount()).toBe(1)
    expect(result.current.state.kind).toBe("pending")

    await advance(2_000)
    expect(callCount()).toBe(2)
    expect(result.current.state.kind).toBe("ready")
    expect(result.current.fetching).toBe(false)

    await advance(60_000)
    expect(callCount()).toBe(2)
  })

  it("2・5・10・20 秒の間隔で取り直し、使い切ると取れなかった状態になる", async () => {
    const callCount = stubReports(notApplicablePlanUsage())
    const { result } = renderPlanUsage()

    await advance(0)
    expect(callCount()).toBe(1)

    await advance(1_999)
    expect(callCount()).toBe(1)
    await advance(1)
    expect(callCount()).toBe(2)

    await advance(5_000)
    expect(callCount()).toBe(3)
    await advance(10_000)
    expect(callCount()).toBe(4)
    expect(result.current.state.kind).toBe("pending")

    await advance(19_999)
    expect(callCount()).toBe(4)
    await advance(1)
    expect(callCount()).toBe(5)
    expect(result.current.state.kind).toBe("unavailable")
    expect(result.current.fetching).toBe(false)

    await advance(120_000)
    expect(callCount()).toBe(5)
  })

  it("待っている間は取得中で、取り直しの合間も取得中のまま", async () => {
    stubReports(notApplicablePlanUsage())
    const { result } = renderPlanUsage()

    await advance(0)
    expect(result.current.state.kind).toBe("pending")
    expect(result.current.fetching).toBe(true)

    await advance(1_000)
    expect(result.current.state.kind).toBe("pending")
    expect(result.current.fetching).toBe(true)
  })

  it("ボタンでの取り直しは1回だけで、列を始めない", async () => {
    const callCount = stubReports(notApplicablePlanUsage())
    const { result } = renderPlanUsage()
    await advance(37_000)
    expect(callCount()).toBe(5)
    expect(result.current.state.kind).toBe("unavailable")

    act(() => {
      result.current.retry()
    })
    await advance(0)
    expect(callCount()).toBe(6)
    expect(result.current.state.kind).toBe("unavailable")
    expect(result.current.fetching).toBe(false)

    await advance(120_000)
    expect(callCount()).toBe(6)
  })

  it("ターンが終わって鍵が変わると、回数を数え直して列をやり直す", async () => {
    const callCount = stubReports(notApplicablePlanUsage())
    const { result, rerender } = renderPlanUsage()
    await advance(37_000)
    expect(callCount()).toBe(5)
    expect(result.current.state.kind).toBe("unavailable")

    rerender({ count: 1 })
    await advance(0)
    expect(callCount()).toBe(6)
    expect(result.current.state.kind).toBe("pending")

    await advance(37_000)
    expect(callCount()).toBe(10)
    expect(result.current.state.kind).toBe("unavailable")
  })

  it.each([2, 3, 4, 5])(
    "列の%i回目で応答が落ちたら、取れなかった状態になり、取り直しも止まる",
    async (failingCall) => {
      let calls = 0
      fetchStub = stubRpcFetch(() => {
        calls += 1
        return calls === failingCall ? rpcError(503) : rpcOutput(notApplicablePlanUsage())
      })
      const { result } = renderPlanUsage()

      await advance(37_000)

      expect(calls).toBe(failingCall)
      expect(result.current.state.kind).toBe("unavailable")
      expect(result.current.fetching).toBe(false)

      await advance(120_000)
      expect(calls).toBe(failingCall)
    },
  )
})
