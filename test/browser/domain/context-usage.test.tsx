import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useContextUsage } from "../../../src/browser/domain/context-usage.ts"
import { readyContextUsage } from "../../fixture/context-usage.ts"
import { createTestQueryClient, queryClientWrapper } from "../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../rpc-fetch-stub.ts"

/**
 * 画面を丸ごと描かずに、内訳の取得と畳み方だけを測る（docs/architecture.md「機能の中を分ける」）。
 *
 * `useContextUsage` は `refetchKey` を受け取る（`browser/domain/` は `stores/` を読めないので、
 * 「いつ取り直すか」は呼び出し側の責務）。ここではテストが直接キーを渡す。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function stubContextUsageFetch(reply: () => RpcStubReply): void {
  fetchStub = stubRpcFetch(reply)
}

/** 取りに行った回数。 */
function fetchCount(): number {
  return fetchStub?.calls().length ?? 0
}

describe("useContextUsage", () => {
  it("内訳の手続きを呼ぶ", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    renderHook(() => useContextUsage(0), { wrapper: queryClientWrapper(createTestQueryClient()) })

    await waitFor(() => {
      expect(fetchStub?.calls()[0]?.procedure).toBe("contextUsage/report")
    })
  })

  it("中身・空き・自動圧縮バッファをこの順の1本の並びに畳み、窓の外は別に持つ", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    const { result } = renderHook(() => useContextUsage(0), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.kind).toBe("ready")
    })
    const card = result.current
    if (card.kind !== "ready") {
      throw new Error("内訳が取れていない")
    }
    expect(card.rows.map((row) => row.kind)).toEqual([
      "used",
      "used",
      "used",
      "used",
      "free",
      "buffer",
    ])
    expect(card.deferredRows.map((row) => row.name)).toEqual(["MCP tools (deferred)"])
    // 架空の内訳は空きが 95,000 / 窓が 200,000。
    expect(card.untilCompactTokens).toBe(95_000)
    expect(card.rows[0]?.share).toBeCloseTo(4)
  })

  it("応答が落ちたときは「読み込み中」を経てから「取れない」になる", async () => {
    stubContextUsageFetch(() => rpcError(403, "FORBIDDEN"))

    const { result } = renderHook(() => useContextUsage(0), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    expect(result.current.kind).toBe("pending")

    await waitFor(() => {
      expect(result.current.kind).toBe("unavailable")
    })
  })

  it("refetchKey が変わると取り直す（ターンが終わるたびに1回。完了条件）", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    const { result, rerender } = renderHook(({ key }: { key: number }) => useContextUsage(key), {
      wrapper: queryClientWrapper(createTestQueryClient()),
      initialProps: { key: 0 },
    })

    await waitFor(() => {
      expect(result.current.kind).toBe("ready")
    })
    expect(fetchCount()).toBe(1)

    // 同じ key での再描画は取り直さない（二重取得にならない。「解くべき論点」）。
    // `queryKey` が変わらない限り react-query は取り直しを起こさないので、待たずに測れる。
    rerender({ key: 0 })
    expect(fetchCount()).toBe(1)

    // ターンが終わって key が変わると、もう1回取り直す。
    rerender({ key: 12_345 })
    await waitFor(() => {
      expect(fetchCount()).toBe(2)
    })
  })
})
