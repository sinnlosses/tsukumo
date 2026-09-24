import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useAchievement } from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
import { type DailyAchievement } from "../../../../src/shared/achievement.ts"
import { type CharacterInfo, type CharacterPackEntry } from "../../../../src/shared/character.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

/**
 * 画面（`achievement-screen.tsx`）を丸ごと描かずに、日の切り替えと取得の畳み方・振り返りの
 * ボタン・書いている進み・立ち絵の解決だけを測る（docs/design.md 2章「機能の中を分ける」）。
 * フィクスチャはすべて手で書いた架空の成果・日記（`docs/coding-standards.md`「会話内容の扱い」）。
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
  diary: { kind: "none" },
}

const WRITTEN_TODAY: DailyAchievement = {
  ...KNOWN_TODAY,
  diary: {
    kind: "written",
    diary: {
      version: 1,
      date: "2026-09-24",
      paragraphs: [
        {
          writtenAt: "2026-09-24T21:40:00+09:00",
          body: "架空の日記の本文。",
          expression: "proud",
          writer: { pack: "fixture-pack", name: "架空の名前" },
        },
      ],
      bookmark: { kind: "none" },
    },
  },
}

const FIXTURE_CHARACTER: CharacterInfo = {
  pack: "fixture-pack",
  name: "架空のいまの名前",
  accent: undefined,
  chatAccent: undefined,
  expressions: [],
  portraits: undefined,
  expressionsWithPortrait: [],
  mini: undefined,
  face: undefined,
  tagline: undefined,
  userCall: undefined,
  miniCall: undefined,
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  background: undefined,
  editable: false,
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

  it("main が読めなければ unavailable", async () => {
    stubAchievementFetch(() => okResponse({ kind: "unknown" }))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("unavailable")
    })
  })

  it("応答が落ち、一度も届いていなければ failed", async () => {
    stubAchievementFetch(() => ({ ok: false, status: 503, json: () => Promise.resolve(null) }))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("failed")
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

  it("灯りの暦のマスと同じ口（onSelectDate）で日を選べる", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(newClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    act(() => {
      result.current.onSelectDate("2026-09-10")
    })

    expect(window.location.hash).toBe("#achievement?date=2026-09-10")
  })
})

describe("useAchievement（振り返りのボタン）", () => {
  it("押すと日付だけを送り、画面は移らない（hash はそのまま）", async () => {
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

    expect(sent).toEqual([{ type: "reflect-achievement", date: "2026-09-24" }])
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
      ...KNOWN_TODAY,
      commitCount: 0,
      doneTasks: { kind: "known", items: [] },
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

describe("useAchievement（書いている進み）", () => {
  it("見ている日を書いているときだけ writing になる", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(
          stateWith({
            diaryWriting: { kind: "writing", date: "2026-09-24", startedAt: 0, stage: "write" },
          }),
        ),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "writing", stage: "write" })
  })

  it("別の日を書いていれば、見ている日は none のまま", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(
          stateWith({
            diaryWriting: { kind: "writing", date: "2026-09-20", startedAt: 0, stage: "read" },
          }),
        ),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "none" })
  })

  it("見ている日で書けなかったときは failed になる", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ diaryWriting: { kind: "failed", date: "2026-09-24" } })),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "failed" })
  })
})

describe("useAchievement（日記の立ち絵）", () => {
  it("日記が無い日は、いまのパックの名前を default の表情で出す", async () => {
    stubAchievementFetch(() => okResponse(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ character: FIXTURE_CHARACTER })),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空のいまの名前")
  })

  it("日記が書き上がっていれば、書いたパックの名前を出す（いまのパックと違ってもよい）", async () => {
    stubAchievementFetch(() => okResponse(WRITTEN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ character: FIXTURE_CHARACTER })),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空の名前")
  })

  it("書いたパックが一覧に無ければ、立ち絵は出ず名前だけ残る", async () => {
    stubAchievementFetch(() => okResponse(WRITTEN_TODAY))
    const packs: readonly CharacterPackEntry[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        newClient(),
        sessionStoreWith(stateWith({ characterPacks: packs })),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空の名前")
    expect(result.current.diaryPortrait.portrait.portraitUrl).toBeUndefined()
  })
})
