import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useTokenUsage } from "../../../../src/browser/features/token-usage/hooks/use-token-usage.ts"
import { DEFAULT_TOKEN_USAGE_DAYS } from "../../../../src/shared/token-usage-summary.ts"

/**
 * 画面（`token-usage-screen.tsx`）を丸ごと描かずに、期間の選択と取得の畳み方だけを測る
 * （docs/design.md 2章「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の集計
 * （`docs/coding-standards.md`「会話内容の扱い」— 集計に文面は入らないが、実物は使わない）。
 */

let originalFetch: typeof globalThis.fetch | undefined = undefined
let fetchCalls: string[] = []

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
    originalFetch = undefined
  }
  fetchCalls = []
})

type StubResponse = {
  readonly ok: boolean
  readonly status: number
  readonly json: () => Promise<unknown>
}

function stubTokenUsageFetch(respond: () => StubResponse): void {
  originalFetch = globalThis.fetch
  const stub = (url: string): Promise<StubResponse> => {
    fetchCalls.push(url)
    return Promise.resolve(respond())
  }
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

/** `useQuery` が要る `QueryClientProvider`。**client は呼び出し側で1回だけ作る**（再レンダーの
 * たびに作り直すとキャッシュが毎回リセットされ、選び直した日数の取り直しが測れない）。 */
function tokenUsageWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
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
  byDay: [{ date: "2001-02-03", totals: FIXTURE_TOTALS }],
  byModel: [{ model: "架空モデル", totals: FIXTURE_TOTALS }],
  byTool: [],
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe("useTokenUsage", () => {
  it("初期の期間は既定の日数", async () => {
    stubTokenUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(FIXTURE_SUMMARY),
    }))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    expect(result.current.days).toBe(DEFAULT_TOKEN_USAGE_DAYS)
    // 取得は非同期に終わる。**確定するまで待ってからテストを終える**（待たずに終えると、
    // 次のテストの実行中に応答が届いて act の外で state が更新される）。
    await waitFor(() => {
      expect(result.current.summary.byDay.length).toBeGreaterThan(0)
    })
  })

  it("onDaysChange で選ぶと日数が変わり、その日数で取り直す", async () => {
    stubTokenUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(FIXTURE_SUMMARY),
    }))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })
    await waitFor(() => {
      expect(
        fetchCalls.some((url) => url.includes(`days=${String(DEFAULT_TOKEN_USAGE_DAYS)}`)),
      ).toBe(true)
    })

    act(() => {
      result.current.onDaysChange(30)
    })

    expect(result.current.days).toBe(30)
    await waitFor(() => {
      expect(fetchCalls.some((url) => url.includes("days=30"))).toBe(true)
    })
  })

  it("取れたら合計込みの集計を返し、isError は立たない", async () => {
    stubTokenUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(FIXTURE_SUMMARY),
    }))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.summary.byDay).toHaveLength(1)
    })
    expect(result.current.isError).toBe(false)
    expect(result.current.total).toEqual(FIXTURE_TOTALS)
  })

  it("応答が落ちたら isError が立ち、集計は空のまま", async () => {
    stubTokenUsageFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve(null) }))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.summary.byDay).toEqual([])
    expect(result.current.total.costUsd).toBe(0)
  })

  it("読めない形で届いたら、落ちずに空の集計になる", async () => {
    stubTokenUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ not: "valid" }),
    }))
    const client = newClient()

    const { result } = renderHook(() => useTokenUsage(), { wrapper: tokenUsageWrapper(client) })

    // 空の集計は「まだ届いていない」ときと見た目が同じ（`EMPTY_TOKEN_USAGE_SUMMARY` を共有する）
    // ので、確定を待つには集計そのものではなく queryClient の状態を見る。
    await waitFor(() => {
      expect(client.getQueryState(["token-usage", DEFAULT_TOKEN_USAGE_DAYS])?.status).toBe(
        "success",
      )
    })
    expect(result.current.isError).toBe(false)
    expect(result.current.summary.byDay).toEqual([])
  })
})
