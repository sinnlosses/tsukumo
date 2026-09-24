import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { type AchievementCalendarView } from "../../../../src/browser/features/achievement/hooks/use-achievement-calendar.ts"
import { type AchievementDaySwitch } from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"
import { useDiaryBook } from "../../../../src/browser/features/achievement/hooks/use-diary-book.ts"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
import { type DailyAchievement } from "../../../../src/shared/achievement.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

/**
 * 漢数字の純関数と、見開きの開閉・取得・前後の送り・目次・白紙の日の振り返りボタンを測る
 * （`use-achievement.test.tsx` と同じ形）。フィクスチャはすべて手で書いた架空の成果・日記
 * （`docs/coding-standards.md`「会話内容の扱い」）。
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

function stubFetch(respond: (url: string) => StubResponse): void {
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

function wrapper(
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

const KNOWN_TODAY: AchievementDaySwitch = { kind: "known", date: "2026-09-24", today: "2026-09-24" }
const UNKNOWN_DAY_SWITCH: AchievementDaySwitch = { kind: "unknown" }

const CALENDAR: AchievementCalendarView = {
  kind: "known",
  today: "2026-09-24",
  days: [],
  diaryDates: ["2026-09-24", "2026-09-16", "2026-08-30", "2026-08-20"],
}

const EMPTY_CALENDAR: AchievementCalendarView = { kind: "loading" }

const WRITTEN_DAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-16",
  today: "2026-09-24",
  commitCount: 5,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
  graduations: [{ id: "T-2", summary: "架空の卒業", registeredOn: "2026-09-01", days: 15 }],
  milestones: [{ kind: "commit", count: 1000, time: "14:12" }],
  diary: {
    kind: "written",
    diary: {
      version: 1,
      date: "2026-09-16",
      paragraphs: [
        {
          writtenAt: "2026-09-16T21:40:00+09:00",
          body: "架空の日記の本文1。",
          expression: "proud",
          writer: { pack: "fixture", name: "架空の名前" },
        },
        {
          writtenAt: "2026-09-16T22:10:00+09:00",
          body: "架空の日記の本文2（書き足し）。",
          expression: "proud",
          writer: { pack: "fixture", name: "架空の名前" },
        },
      ],
      bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク", reason: "架空の理由" },
    },
  },
}

const BLANK_DAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
  commitCount: 4,
  doneTasks: { kind: "known", items: [] },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
}

const EMPTY_BLANK_DAY: DailyAchievement = { ...BLANK_DAY, commitCount: 0 }

describe("useDiaryBook（開閉）", () => {
  it("既定は閉じていて、灯りの暦から開くと見ている日も切り替わる", async () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const selected: string[] = []
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: CALENDAR,
          daySwitch: KNOWN_TODAY,
          onDateSelected: (date) => selected.push(date),
        }),
      { wrapper: wrapper(newClient()) },
    )

    expect(result.current.open).toBe(false)

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })

    expect(result.current.open).toBe(true)
    expect(result.current.openNote).toBe("灯りの暦から開きました")
    expect(selected).toEqual(["2026-09-16"])
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })
  })

  it("「日記帳で読む」からは、いま見ている日で開く（見ている日を切り替えない）", async () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const selected: string[] = []
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: CALENDAR,
          daySwitch: { kind: "known", date: "2026-09-16", today: "2026-09-24" },
          onDateSelected: (date) => selected.push(date),
        }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromDiarySection()
    })

    expect(result.current.open).toBe(true)
    expect(result.current.openNote).toBe("この日の日記から開きました")
    expect(selected).toEqual([])
  })

  it("見ている日が分からないときは「日記帳で読む」を押しても開かない", () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: CALENDAR,
          daySwitch: UNKNOWN_DAY_SWITCH,
          onDateSelected: () => {},
        }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromDiarySection()
    })

    expect(result.current.open).toBe(false)
  })

  it("閉じると取得も止まり、次に開くと取り直す", async () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    act(() => {
      result.current.onClose()
    })
    expect(result.current.open).toBe(false)
  })
})

describe("useDiaryBook（書かれた日）", () => {
  it("段落は書いた順に並び、2つ目以降だけ時刻を持つ", async () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    const page = result.current.page
    if (page.kind !== "ready" || page.right.kind !== "written") {
      throw new Error("written のはず")
    }
    expect(page.right.paragraphs.map((paragraph) => paragraph.body)).toEqual([
      "架空の日記の本文1。",
      "架空の日記の本文2（書き足し）。",
    ])
    expect(page.right.paragraphs[0]?.timeLabel).toBeUndefined()
    expect(page.right.paragraphs[1]?.timeLabel).toBe("〔22:10〕")
    expect(page.kanjiDate).toBe("九月十六日")
    expect(page.weekday).toBe("水曜日")
    expect(page.bookmark).toEqual({
      kind: "placed",
      taskId: "T-1",
      summary: "架空のタスク",
      reason: "架空の理由",
    })
    expect(page.badges).toEqual([
      { kind: "graduation", key: "graduation-T-2", taskId: "T-2" },
      {
        kind: "milestone",
        key: "milestone-commit-14:12",
        countLabel: "千",
        unitLabel: "コミット目",
      },
    ])
  })

  it("しおりが無い日記は bookmark が none になる", async () => {
    const noBookmark: DailyAchievement = {
      ...WRITTEN_DAY,
      diary: {
        kind: "written",
        diary: {
          ...(WRITTEN_DAY.diary.kind === "written" ? WRITTEN_DAY.diary.diary : ({} as never)),
          bookmark: { kind: "none" },
        },
      },
    }
    stubFetch(() => okResponse(noBookmark))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    const page = result.current.page
    expect(page.kind === "ready" ? page.bookmark : undefined).toEqual({ kind: "none" })
  })
})

describe("useDiaryBook（白紙の日）", () => {
  it("白紙の日は bookmark が pending で、押すと reflect-achievement を送り見ている日も変わって閉じる", async () => {
    stubFetch((url) => okResponse(url.includes("date=2026-09-23") ? BLANK_DAY : WRITTEN_DAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const selected: string[] = []
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: CALENDAR,
          daySwitch: KNOWN_TODAY,
          onDateSelected: (date) => selected.push(date),
        }),
      { wrapper: wrapper(newClient(), sessionStoreWith(stateWith({}), spy)) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-23")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    const page = result.current.page
    expect(page.kind === "ready" ? page.bookmark.kind : undefined).toBe("pending")
    if (page.kind !== "ready" || page.right.kind !== "blank") {
      throw new Error("blank のはず")
    }
    expect(page.right.review.label).toBe("この日を振り返る")
    expect(page.right.review.availability).toEqual({ kind: "available" })
    const review = page.right.review

    act(() => {
      review.onReview()
    })

    expect(sent).toEqual([{ type: "reflect-achievement", date: "2026-09-23" }])
    expect(selected).toEqual(["2026-09-23", "2026-09-23"])
    expect(result.current.open).toBe(false)
  })

  it("空の日は押せず、押しても送らない", async () => {
    stubFetch(() => okResponse(EMPTY_BLANK_DAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: CALENDAR,
          daySwitch: KNOWN_TODAY,
          onDateSelected: () => {},
        }),
      { wrapper: wrapper(newClient(), sessionStoreWith(stateWith({}), spy)) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-23")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    const page = result.current.page
    if (page.kind !== "ready" || page.right.kind !== "blank") {
      throw new Error("blank のはず")
    }
    expect(page.right.review.availability).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
    const review = page.right.review

    act(() => {
      review.onReview()
    })
    expect(sent).toHaveLength(0)
  })

  it("ターンが進行中は押せない", async () => {
    stubFetch(() => okResponse(BLANK_DAY))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      {
        wrapper: wrapper(
          newClient(),
          sessionStoreWith(stateWith({ turn: { kind: "running", startedAt: 0 } })),
        ),
      },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-23")
    })
    await waitFor(() => {
      expect(result.current.page.kind).toBe("ready")
    })

    const page = result.current.page
    if (page.kind !== "ready" || page.right.kind !== "blank") {
      throw new Error("blank のはず")
    }
    expect(page.right.review.availability).toEqual({
      kind: "blocked",
      reason: "いまターンが動いているので送れない",
    })
  })
})

describe("useDiaryBook（前後の送りと目次）", () => {
  it("前後は日記のある日だけへ飛び、無ければ undefined", () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })

    expect(result.current.previous).toEqual({ date: "2026-08-30", label: "8月30日" })
    expect(result.current.next).toEqual({ date: "2026-09-24", label: "9月24日" })

    act(() => {
      result.current.onNext()
    })
    expect(result.current.next).toBeUndefined()
  })

  it("目次は月ごとに畳み、選ぶとその日へ移って閉じる", () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () => useDiaryBook({ calendar: CALENDAR, daySwitch: KNOWN_TODAY, onDateSelected: () => {} }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })
    act(() => {
      result.current.onToggleToc()
    })

    expect(result.current.toc.open).toBe(true)
    expect(result.current.toc.months.map((month) => month.heading)).toEqual([
      "2026年9月",
      "2026年8月",
    ])
    expect(result.current.toc.months[0]?.days.map((day) => day.date)).toEqual([
      "2026-09-24",
      "2026-09-16",
    ])

    act(() => {
      result.current.onSelectTocDate("2026-08-20")
    })
    expect(result.current.toc.open).toBe(false)
  })

  it("暦が取れていないときは前後も目次も空", () => {
    stubFetch(() => okResponse(WRITTEN_DAY))
    const { result } = renderHook(
      () =>
        useDiaryBook({
          calendar: EMPTY_CALENDAR,
          daySwitch: KNOWN_TODAY,
          onDateSelected: () => {},
        }),
      { wrapper: wrapper(newClient()) },
    )

    act(() => {
      result.current.onOpenFromCalendar("2026-09-16")
    })

    expect(result.current.previous).toBeUndefined()
    expect(result.current.next).toBeUndefined()
    expect(result.current.toc.months).toEqual([])
  })
})
