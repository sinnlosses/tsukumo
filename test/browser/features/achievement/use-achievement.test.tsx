import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useAchievement } from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"
import { type DailyAchievement } from "../../../../src/shared/achievement.ts"

/**
 * 画面（`achievement-screen.tsx`）を丸ごと描かずに、日の切り替えと取得の畳み方だけを測る
 * （docs/design.md 2章「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の成果
 * （`docs/coding-standards.md`「会話内容の扱い」— 応答にそもそも会話の文面は入らないが、
 * 実物は使わない）。
 */

let originalFetch: typeof globalThis.fetch | undefined = undefined
let fetchCalls: string[] = []

afterEach(() => {
  cleanup()
  window.location.hash = ""
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

function stubAchievementFetch(respond: (url: string) => StubResponse): void {
  originalFetch = globalThis.fetch
  const stub = (url: string): Promise<StubResponse> => {
    fetchCalls.push(url)
    return Promise.resolve(respond(url))
  }
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

function okResponse(body: unknown): StubResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body) }
}

/** `useQuery` が要る `QueryClientProvider`。**client は呼び出し側で1回だけ作る**
 * （再レンダーのたびに作り直すとキャッシュが毎回リセットされ、日を切り替えた取り直しが測れない）。 */
function achievementWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const KNOWN_TODAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-24",
  today: "2026-09-24",
  commitCount: 3,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
}

const KNOWN_YESTERDAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
  commitCount: 0,
  doneTasks: { kind: "known", items: [] },
}

describe("useAchievement", () => {
  it("date が無ければ今日を取りに行く（date クエリを付けない）", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(fetchCalls.some((url) => url.includes("/achievement"))).toBe(true)
    expect(fetchCalls.some((url) => url.includes("date="))).toBe(false)
    expect(result.current.daySwitch).toEqual({
      kind: "known",
      date: "2026-09-24",
      today: "2026-09-24",
    })
  })

  it("hash に date があれば、その日を date クエリで取りに行く", async () => {
    window.location.hash = "#achievement?date=2026-09-20"
    stubAchievementFetch(() => okResponse(KNOWN_YESTERDAY))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(fetchCalls.some((url) => url.includes("date=2026-09-20"))).toBe(true)
  })

  it("main が読めなければ unavailable", async () => {
    stubAchievementFetch(() => okResponse({ kind: "unknown" }))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("unavailable")
    })
    expect(result.current.daySwitch).toEqual({ kind: "unknown" })
  })

  it("応答が落ち、一度も届いていなければ failed で日の切り替えも unknown", async () => {
    stubAchievementFetch(() => ({ ok: false, status: 503, json: () => Promise.resolve(null) }))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("failed")
    })
    expect(result.current.daySwitch).toEqual({ kind: "unknown" })
  })

  it("取れたあとに落ちても、日の切り替えは前に届いた日のまま使える", async () => {
    let succeed = true
    stubAchievementFetch(() =>
      succeed
        ? okResponse(KNOWN_YESTERDAY)
        : { ok: false, status: 503, json: () => Promise.resolve(null) },
    )
    const client = newClient()
    const { result } = renderHook(() => useAchievement(), { wrapper: achievementWrapper(client) })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    succeed = false
    await act(async () => {
      await client.refetchQueries({ queryKey: ["achievement", "today"] })
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("failed")
    })
    // 直前に届いていた日付はそのまま残る（`docs/screen-design.md` 13.10「取りに行って失敗した」
    // 「日の切り替えは使える」）。
    expect(result.current.daySwitch).toEqual({
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
    })
  })

  it("前の日へ切り替えると hash の date が1日前になる", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    act(() => {
      result.current.onPreviousDay()
    })

    expect(window.location.hash).toBe("#achievement?date=2026-09-23")
  })

  it("今日を見ているときに次の日を押しても hash は変わらない", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    act(() => {
      result.current.onNextDay()
    })

    expect(window.location.hash).toBe("")
  })

  it("今日へを押すと hash の date が外れる", async () => {
    window.location.hash = "#achievement?date=2026-09-20"
    stubAchievementFetch(() => okResponse(KNOWN_YESTERDAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    act(() => {
      result.current.onToday()
    })

    expect(window.location.hash).toBe("#achievement")
  })
})
