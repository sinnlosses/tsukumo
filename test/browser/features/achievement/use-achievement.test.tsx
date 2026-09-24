import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useAchievement } from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
import { type DailyAchievement } from "../../../../src/shared/achievement.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

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

/** `useQuery` が要る `QueryClientProvider` と、`useAchievement` が読む session store。
 * **client は呼び出し側で1回だけ作る**（再レンダーのたびに作り直すとキャッシュが毎回リセット
 * され、日を切り替えた取り直しが測れない）。 */
function achievementWrapper(
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

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function stateWith(patch: Partial<SessionState>): SessionState {
  return { ...INITIAL_SESSION_STATE, ...patch }
}

const KNOWN_TODAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-24",
  today: "2026-09-24",
  commitCount: 3,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
  graduations: [],
  milestones: [],
}

const KNOWN_YESTERDAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
  commitCount: 0,
  doneTasks: { kind: "known", items: [] },
  graduations: [],
  milestones: [],
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

describe("useAchievement（振り返りのボタン）", () => {
  it("押すと依頼を1回送り、会話の画面へ移る", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient(), sessionStoreWith(stateWith({}), spy)),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(result.current.review.availability).toEqual({ kind: "available" })

    act(() => {
      result.current.review.onReview()
    })

    expect(sent).toHaveLength(1)
    expect((sent[0] as { readonly type: string }).type).toBe("prompt")
    expect(window.location.hash.startsWith("#achievement")).toBe(false)
  })

  it("ターンが進行中は押せず、押しても送らない", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ turn: { kind: "running", startedAt: 0 } }), spy),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(result.current.review.availability.kind).toBe("blocked")

    act(() => {
      result.current.review.onReview()
    })

    expect(sent).toHaveLength(0)
  })

  it("空の日は押せず、送らない（ターンが進行中でも空の日の理由になる）", async () => {
    const emptyDay: DailyAchievement = {
      kind: "known",
      date: "2026-09-24",
      today: "2026-09-24",
      commitCount: 0,
      doneTasks: { kind: "known", items: [] },
      graduations: [],
      milestones: [],
    }
    stubAchievementFetch(() => okResponse(emptyDay))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ turn: { kind: "running", startedAt: 0 } }), spy),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(
      result.current.review.availability.kind === "blocked"
        ? result.current.review.availability.reason
        : "",
    ).toBe("振り返る成果が無い")

    act(() => {
      result.current.review.onReview()
    })

    expect(sent).toHaveLength(0)
  })

  it("雑談中でも押せる", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient(), sessionStoreWith(stateWith({ chatMode: true }))),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.review.availability).toEqual({ kind: "available" })
  })

  it("キャラクターの名前を持たないときは既定の名前でボタンの文言を組む", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient(), sessionStoreWith(stateWith({}))),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.review.label).toBe("キャラクターと振り返る")
  })
})
