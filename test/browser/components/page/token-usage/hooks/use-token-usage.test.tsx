import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useTokenUsage } from "../../../../../../src/browser/components/page/token-usage/hooks/use-token-usage.ts"
import {
  SessionStoreContext,
  type SessionStore,
} from "../../../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session-state.ts"
import { DEFAULT_TOKEN_USAGE_DAYS } from "../../../../../../src/shared/token-usage-summary.ts"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../../rpc-fetch-stub.ts"
import { sessionStoreWith } from "../../../../session-store.ts"

/**
 * 画面（`token-usage.tsx`）を丸ごと描かずに、期間の選択と取得の畳み方だけを測る
 * （docs/design.md 2章「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の集計
 * （`docs/coding-standards.md`「会話内容の扱い」— 集計に文面は入らないが、実物は使わない）。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function stubTokenUsageFetch(reply: () => RpcStubReply): void {
  fetchStub = stubRpcFetch(reply)
}

/** `tokenUsage.summary` を、この日数で呼んだか。 */
function askedDays(days: number): boolean {
  return (fetchStub?.calls() ?? []).some(
    (call) =>
      call.procedure === "tokenUsage/summary" &&
      JSON.stringify(call.input) === JSON.stringify({ days }),
  )
}

/** `useQuery` が要る `QueryClientProvider`。client は呼び出し側で1回だけ作る（再レンダーの
 * たびに作り直すとキャッシュが毎回リセットされ、選び直した日数の取り直しが測れない）。
 * `useTokenUsage` は `useSessionSelector`（`plan`）も読むので、`SessionStoreContext` も一緒に
 * 包む（既定は `INITIAL_SESSION_STATE` そのまま。`plan` を変えたいテストは `store` を渡す）。 */
function tokenUsageWrapper(
  client: QueryClient,
  store: SessionStore = sessionStoreWith(INITIAL_SESSION_STATE),
): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <SessionStoreContext.Provider value={store}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SessionStoreContext.Provider>
    )
  }
}

const FIXTURE_TOTALS = {
  inputTokens: 100,
  outputTokens: 200,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0.5,
}

const FIXTURE_SUMMARY = {
  trend: { unit: "day", points: [{ key: "2001-02-03", totals: FIXTURE_TOTALS }] },
  byModel: [{ model: "架空モデル", totals: FIXTURE_TOTALS }],
  byTool: [],
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe("useTokenUsage", () => {
  it("初期の期間は既定の日数", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    expect(result.current.days).toBe(DEFAULT_TOKEN_USAGE_DAYS)
    // 取得は非同期に終わる。確定するまで待ってからテストを終える（待たずに終えると、
    // 次のテストの実行中に応答が届いて act の外で state が更新される）。
    await waitFor(() => {
      expect(result.current.summary.trend.points.length).toBeGreaterThan(0)
    })
  })

  it("onDaysChange で選ぶと日数が変わり、その日数で取り直す", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })
    await waitFor(() => {
      expect(askedDays(DEFAULT_TOKEN_USAGE_DAYS)).toBe(true)
    })

    act(() => {
      result.current.onDaysChange(30)
    })

    expect(result.current.days).toBe(30)
    await waitFor(() => {
      expect(askedDays(30)).toBe(true)
    })
  })

  it("取れたら合計込みの集計を返し、isError は立たない", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.summary.trend.points).toHaveLength(1)
    })
    expect(result.current.isError).toBe(false)
    expect(result.current.total).toEqual(FIXTURE_TOTALS)
  })

  it("応答が落ちたら isError が立ち、集計は空のまま", async () => {
    stubTokenUsageFetch(() => rpcError(500))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.summary.trend.points).toEqual([])
    expect(result.current.total.costUsd).toBe(0)
  })

  it("plan は state.plan をそのまま返す", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))
    const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, plan: "max" })

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient(), store),
    })

    expect(result.current.plan).toBe("max")
  })

  it("state.plan がまだ届いていなければ undefined", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    expect(result.current.plan).toBeUndefined()
  })
})
