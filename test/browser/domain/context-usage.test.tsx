import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  contextUsageRefetchKey,
  useContextUsage,
} from "../../../src/browser/domain/context-usage.ts"
import { readyContextUsage } from "../../fixture/context-usage.ts"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../rpc-fetch-stub.ts"

/**
 * 画面を丸ごと描かずに、内訳の取得と畳み方だけを測る（docs/design.md 2章「機能の中を分ける」）。
 * フィクスチャは手で書いた架空の内訳（`docs/coding-standards.md`「会話内容の扱い」）。
 *
 * **`useContextUsage` は `refetchKey` を受け取る**（`browser/domain/` は `stores/` を読めないので、
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

function contextUsageWrapper(
  client: QueryClient,
): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe("useContextUsage", () => {
  it("内訳の手続きを呼ぶ", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    renderHook(() => useContextUsage(0), { wrapper: contextUsageWrapper(newClient()) })

    await waitFor(() => {
      expect(fetchStub?.calls()[0]?.procedure).toBe("contextUsage/report")
    })
  })

  it("中身・空き・自動圧縮バッファをこの順の1本の並びに畳み、窓の外は別に持つ", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    const { result } = renderHook(() => useContextUsage(0), {
      wrapper: contextUsageWrapper(newClient()),
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

  it("届くまでは「読み込み中」で、取れなかったときとは別の種類になる", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    const { result } = renderHook(() => useContextUsage(0), {
      wrapper: contextUsageWrapper(newClient()),
    })

    // まだ応答が届いていない最初のレンダーでは「読み込み中」（「取れない」ではない）。
    expect(result.current.kind).toBe("pending")

    await waitFor(() => {
      expect(result.current.kind).toBe("ready")
    })
  })

  it("応答が落ちたときは「読み込み中」を経てから「取れない」になる", async () => {
    stubContextUsageFetch(() => rpcError(403, "FORBIDDEN"))

    const { result } = renderHook(() => useContextUsage(0), {
      wrapper: contextUsageWrapper(newClient()),
    })

    expect(result.current.kind).toBe("pending")

    await waitFor(() => {
      expect(result.current.kind).toBe("unavailable")
    })
  })

  it("refetchKey が変わると取り直す（ターンが終わるたびに1回。完了条件）", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    const { result, rerender } = renderHook(({ key }: { key: number }) => useContextUsage(key), {
      wrapper: contextUsageWrapper(newClient()),
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

  it("finished → running に移っても取り直さず前の値のまま、次の finished で1回取り直す", async () => {
    stubContextUsageFetch(() => rpcOutput(readyContextUsage()))

    // `state.lastTurnFinishedAt` から作った key の並び（`contextUsageRefetchKey` を経由）。
    // `running` に移っても `lastTurnFinishedAt` 自体は戻らない（`shared/session-state.ts`）ので、
    // ここでは同じ 300 が続くことをそのまま key に反映する——`state.turn` から作っていた旧実装が
    // 巻き戻っていた場面（受け入れの確認で見つかった不具合）の再現。
    const { result, rerender } = renderHook(
      ({ lastTurnFinishedAt }: { lastTurnFinishedAt: number | undefined }) =>
        useContextUsage(contextUsageRefetchKey(lastTurnFinishedAt)),
      {
        wrapper: contextUsageWrapper(newClient()),
        initialProps: { lastTurnFinishedAt: 300 },
      },
    )

    await waitFor(() => {
      expect(result.current.kind).toBe("ready")
    })
    expect(fetchCount()).toBe(1)

    // 次のターンが running に移っても、直前に終わった時刻（300）のまま——取り直さない。
    rerender({ lastTurnFinishedAt: 300 })
    expect(fetchCount()).toBe(1)
    expect(result.current.kind).toBe("ready")

    // そのターンが終わって lastTurnFinishedAt が進むと、もう1回だけ取り直す。
    rerender({ lastTurnFinishedAt: 700 })
    await waitFor(() => {
      expect(fetchCount()).toBe(2)
    })
  })
})

describe("contextUsageRefetchKey", () => {
  it("まだ一度もターンが終わっていなければ 0", () => {
    expect(contextUsageRefetchKey(undefined)).toBe(0)
  })

  it("最後にターンが終わった時刻をそのまま使う（running に移っても呼び出し側がそのまま渡し続ける）", () => {
    expect(contextUsageRefetchKey(200)).toBe(200)
  })
})
