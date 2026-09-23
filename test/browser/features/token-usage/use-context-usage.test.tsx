import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useContextUsage } from "../../../../src/browser/features/token-usage/hooks/use-context-usage.ts"
import { CONTEXT_USAGE_PATH } from "../../../../src/shared/context-usage.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"

/**
 * 画面を丸ごと描かずに、内訳の取得と畳み方だけを測る（docs/design.md 2章「機能の中を分ける」）。
 * フィクスチャは手で書いた架空の内訳（`docs/coding-standards.md`「会話内容の扱い」）。
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

function stubContextUsageFetch(respond: () => StubResponse): void {
  originalFetch = globalThis.fetch
  const stub = (url: string): Promise<StubResponse> => {
    fetchCalls.push(url)
    return Promise.resolve(respond())
  }
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
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
  it("起動トークン付きの経路へ取りに行く", async () => {
    stubContextUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(readyContextUsage()),
    }))

    renderHook(() => useContextUsage(), { wrapper: contextUsageWrapper(newClient()) })

    await waitFor(() => {
      expect(fetchCalls[0]?.startsWith(`${CONTEXT_USAGE_PATH}?t=`)).toBe(true)
    })
  })

  it("中身・空き・自動圧縮バッファをこの順の1本の並びに畳み、窓の外は別に持つ", async () => {
    stubContextUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(readyContextUsage()),
    }))

    const { result } = renderHook(() => useContextUsage(), {
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

  it("応答が落ちたときも読めない形のときも「取れない」に倒す", async () => {
    stubContextUsageFetch(() => ({ ok: false, status: 403, json: () => Promise.resolve(null) }))
    const client = newClient()

    const { result } = renderHook(() => useContextUsage(), {
      wrapper: contextUsageWrapper(client),
    })

    await waitFor(() => {
      expect(client.getQueryState(["context-usage"])?.status).toBe("success")
    })
    expect(result.current.kind).toBe("unavailable")
  })

  it("届くまでは「読み込み中」で、取れなかったときとは別の種類になる", async () => {
    stubContextUsageFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(readyContextUsage()),
    }))

    const { result } = renderHook(() => useContextUsage(), {
      wrapper: contextUsageWrapper(newClient()),
    })

    // まだ応答が届いていない最初のレンダーでは「読み込み中」（「取れない」ではない）。
    expect(result.current.kind).toBe("pending")

    await waitFor(() => {
      expect(result.current.kind).toBe("ready")
    })
  })

  it("応答が落ちたときは「読み込み中」を経てから「取れない」になる", async () => {
    stubContextUsageFetch(() => ({ ok: false, status: 403, json: () => Promise.resolve(null) }))

    const { result } = renderHook(() => useContextUsage(), {
      wrapper: contextUsageWrapper(newClient()),
    })

    expect(result.current.kind).toBe("pending")

    await waitFor(() => {
      expect(result.current.kind).toBe("unavailable")
    })
  })
})
