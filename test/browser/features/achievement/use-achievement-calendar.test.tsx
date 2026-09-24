import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useAchievementCalendar } from "../../../../src/browser/features/achievement/hooks/use-achievement-calendar.ts"
import { type AchievementCalendar } from "../../../../src/shared/achievement-calendar.ts"

/** 灯りの暦の取得だけを測る（架空の値。docs/coding-standards.md「会話内容の扱い」）。 */

let originalFetch: typeof globalThis.fetch | undefined = undefined

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
    originalFetch = undefined
  }
})

type StubResponse = {
  readonly ok: boolean
  readonly status: number
  readonly json: () => Promise<unknown>
}

function stubFetch(respond: () => StubResponse): void {
  originalFetch = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(respond())) as unknown as typeof globalThis.fetch
}

function okResponse(body: unknown): StubResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body) }
}

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const KNOWN: AchievementCalendar = {
  kind: "known",
  today: "2026-09-24",
  days: [{ date: "2026-09-24", commitCount: 5 }],
  diaryDates: ["2026-09-24"],
}

describe("useAchievementCalendar", () => {
  it("届く前は loading", () => {
    stubFetch(() => okResponse(KNOWN))
    const { result } = renderHook(() => useAchievementCalendar(), { wrapper: wrapper(newClient()) })

    expect(result.current.kind).toBe("loading")
  })

  it("届けばそのまま渡す", async () => {
    stubFetch(() => okResponse(KNOWN))
    const { result } = renderHook(() => useAchievementCalendar(), { wrapper: wrapper(newClient()) })

    await waitFor(() => {
      expect(result.current.kind).toBe("known")
    })
    expect(result.current).toEqual(KNOWN)
  })

  it("main が読めなければ unknown", async () => {
    stubFetch(() => okResponse({ kind: "unknown" }))
    const { result } = renderHook(() => useAchievementCalendar(), { wrapper: wrapper(newClient()) })

    await waitFor(() => {
      expect(result.current.kind).toBe("unknown")
    })
  })

  it("取りに行って失敗したときも unknown（main が読めないときと同じ1行になる）", async () => {
    stubFetch(() => ({ ok: false, status: 503, json: () => Promise.resolve(null) }))
    const { result } = renderHook(() => useAchievementCalendar(), { wrapper: wrapper(newClient()) })

    await waitFor(() => {
      expect(result.current.kind).toBe("unknown")
    })
  })
})
