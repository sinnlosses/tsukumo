import type { QueryClient } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAchievement } from "../../../../../../src/browser/components/page/achievement/hooks/use-achievement.ts"
import type { DailyAchievement } from "../../../../../../src/shared/achievement/achievement.ts"
import type {
  CharacterInfo,
  CharacterPackEntry,
} from "../../../../../../src/shared/character-pack/character.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient, queryClientWrapper } from "../../../../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../../rpc-fetch-stub.ts"
import { type CommandSpy, putSession, stateWith } from "../../../../session-store.ts"

/**
 * 画面（`Achievement`）を丸ごと描かずに、日の切り替えと取得の畳み方・振り返りの
 * ボタン・書いている進み・立ち絵の解決だけを測る（docs/architecture.md「機能の中を分ける」）。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  window.location.hash = ""
  fetchStub?.restore()
  fetchStub = undefined
})

function stubAchievementFetch(reply: () => RpcStubReply): void {
  fetchStub = stubRpcFetch(reply)
}

function achievementWrapper(
  client: QueryClient,
  state: SessionState = INITIAL_SESSION_STATE,
  spy: CommandSpy = () => {},
): (props: { children: ReactNode }) => ReactElement {
  putSession(state, spy)
  return queryClientWrapper(client)
}

const KNOWN_TODAY: DailyAchievement = {
  kind: "known",
  date: "2026-09-24",
  today: "2026-09-24",
  doneTasks: [{ id: "T-1", summary: "架空のタスク" }],
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
  diaryFont: undefined,
  editable: false,
}

describe("useAchievement", () => {
  it("date が無ければ今日を取りに行く（日付を送らない）", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(fetchStub?.calls()).toContainEqual({
      procedure: "achievement/day",
      input: { kind: "today" },
    })
    expect(result.current.daySwitch).toEqual({
      kind: "known",
      date: "2026-09-24",
      today: "2026-09-24",
    })
  })

  it("main が読めなければ unavailable", async () => {
    stubAchievementFetch(() => rpcOutput({ kind: "unknown" }))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("unavailable")
    })
  })

  it("応答が落ち、一度も届いていなければ view も日記の区画も failed", async () => {
    stubAchievementFetch(() => rpcError(503, "UNAVAILABLE"))

    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.view.kind).toBe("failed")
    })
    expect(result.current.diarySection).toEqual({ kind: "failed" })
  })

  it("前の日へ切り替えると hash の date が1日前になる", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
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
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    act(() => {
      result.current.onSelectDate("2026-09-10")
    })

    expect(window.location.hash).toBe("#achievement?date=2026-09-10")
  })

  it("5分以上離れて開き直しても前回の中身がすぐ描かれ、取り直しのあとで替わる", async () => {
    const client = createTestQueryClient()
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result, unmount } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(client),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    unmount()
    fetchStub?.restore()
    fetchStub = undefined

    vi.useFakeTimers()
    try {
      await vi.advanceTimersByTimeAsync(6 * 60_000)
    } finally {
      vi.useRealTimers()
    }

    const REFRESHED_TODAY: DailyAchievement = {
      ...KNOWN_TODAY,
      doneTasks: [
        { id: "T-1", summary: "架空のタスク" },
        { id: "T-2", summary: "架空のタスク2" },
      ],
    }
    stubAchievementFetch(() => rpcOutput(REFRESHED_TODAY))
    const reopened = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(client),
    })

    expect(reopened.result.current.diarySection).toMatchObject({ doneTaskCount: "1" })

    await waitFor(() => {
      expect(reopened.result.current.diarySection).toMatchObject({ doneTaskCount: "2" })
    })
  })
})

describe("useAchievement（振り返りのボタン）", () => {
  it("押すと日付だけを送り、画面は移らない（hash はそのまま）", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient(), stateWith({}), spy),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(result.current.review.availability).toEqual({ kind: "available" })

    act(() => {
      result.current.review.onReview()
    })

    expect(sent).toEqual([{ procedure: "session.reflectAchievement", date: "2026-09-24" }])
    expect(window.location.hash.startsWith("#achievement")).toBe(false)
  })

  it.each([
    ["会話のターンが進行中", { turn: { kind: "running", startedAt: 0 } }],
    ["雑談中", { chatMode: true }],
  ] satisfies readonly (readonly [string, Partial<SessionState>])[])(
    "%sでも押せる（振り返りは会話とは別の使い捨ての問い合わせ）",
    async (_name, state) => {
      stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
      const spy: CommandSpy = (command) => sent.push(command)
      const sent: unknown[] = []
      const { result } = renderHook(() => useAchievement(), {
        wrapper: achievementWrapper(createTestQueryClient(), stateWith(state), spy),
      })
      await waitFor(() => {
        expect(result.current.view.kind).toBe("ready")
      })
      expect(result.current.review.availability).toEqual({ kind: "available" })

      act(() => {
        result.current.review.onReview()
      })

      expect(sent).toEqual([{ procedure: "session.reflectAchievement", date: "2026-09-24" }])
    },
  )

  it("ほかの日の日記を書いている最中は押せず、押しても送らない", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const spy: CommandSpy = (command) => sent.push(command)
    const sent: unknown[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({
          diaryWriting: { kind: "writing", date: "2026-09-20", startedAt: 0, stage: "read" },
        }),
        spy,
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

  it("キャラクターの名前を持たないときは既定の名前でボタンの文言を組む", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient(), stateWith({})),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.review.label).toBe("キャラクターと振り返る")
  })
})

describe("useAchievement（書いている進み）", () => {
  it("見ている日を書いているときだけ writing になる", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({
          diaryWriting: { kind: "writing", date: "2026-09-24", startedAt: 0, stage: "write" },
        }),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "writing", stage: "write" })
  })

  it("別の日を書いていれば、見ている日は none のまま", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({
          diaryWriting: { kind: "writing", date: "2026-09-20", startedAt: 0, stage: "read" },
        }),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "none" })
  })

  it("見ている日で書けなかったときは failed になる", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({ diaryWriting: { kind: "failed", date: "2026-09-24" } }),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.writing).toEqual({ kind: "failed" })
  })
})

describe("useAchievement（日記の区画）", () => {
  it("日記が書き上がっていれば、最後の段落と時刻の字・数の札を畳む", async () => {
    stubAchievementFetch(() => rpcOutput(WRITTEN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diarySection).toEqual({
      kind: "shown",
      ready: true,
      reviewedLabel: { kind: "shown", label: "振り返り [21:40]" },
      canOpenBook: true,
      bubble: {
        kind: "written",
        key: "2026-09-24-2026-09-24T21:40:00+09:00",
        body: "架空の日記の本文。",
        revisionId: 1,
      },
      doneTaskCount: "1",
    })
  })

  it("日記が無い日は「まだこの日の日記は無い。」、空の日は終えたタスクが無い旨", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(result.current.diarySection).toMatchObject({
      reviewedLabel: { kind: "none" },
      canOpenBook: false,
      bubble: { kind: "notes", notes: ["まだこの日の日記は無い。"] },
    })

    fetchStub?.restore()
    stubAchievementFetch(() => rpcOutput({ ...KNOWN_TODAY, doneTasks: [] }))
    const empty = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(empty.result.current.view.kind).toBe("ready")
    })
    expect(empty.result.current.diarySection).toMatchObject({
      bubble: { kind: "notes", notes: ["この日に終えたタスクは無い。"] },
      doneTaskCount: "0",
    })
  })

  it("読み込み中は札が「…」で吹き出しは空", () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient()),
    })

    expect(result.current.diarySection).toMatchObject({
      ready: false,
      bubble: { kind: "blank" },
      doneTaskCount: "…",
    })
  })

  it("書いている間は最後の段落の本文を残し、書けなかったときは書き直しの文言を先に置く", async () => {
    stubAchievementFetch(() => rpcOutput(WRITTEN_TODAY))
    const writing = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({
          diaryWriting: { kind: "writing", date: "2026-09-24", startedAt: 0, stage: "write" },
        }),
      ),
    })
    await waitFor(() => {
      expect(writing.result.current.view.kind).toBe("ready")
    })
    expect(writing.result.current.diarySection).toMatchObject({
      bubble: { kind: "notes", notes: ["架空の日記の本文。"] },
    })

    const failed = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({ diaryWriting: { kind: "failed", date: "2026-09-24" } }),
      ),
    })
    await waitFor(() => {
      expect(failed.result.current.view.kind).toBe("ready")
    })
    expect(failed.result.current.diarySection).toMatchObject({
      bubble: {
        kind: "notes",
        notes: ["日記を書けなかった。もう一度押すと書き直す。", "架空の日記の本文。"],
      },
    })
  })
})

describe("useAchievement（日記の立ち絵）", () => {
  it("日記が無い日は、いまのパックの名前を default の表情で出す", async () => {
    stubAchievementFetch(() => rpcOutput(KNOWN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({ character: FIXTURE_CHARACTER }),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空のいまの名前")
  })

  it("日記が書き上がっていれば、書いたパックの名前を出す（いまのパックと違ってもよい）", async () => {
    stubAchievementFetch(() => rpcOutput(WRITTEN_TODAY))
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(
        createTestQueryClient(),
        stateWith({ character: FIXTURE_CHARACTER }),
      ),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空の名前")
  })

  it("書いたパックが一覧に無ければ、立ち絵は出ず名前だけ残る", async () => {
    stubAchievementFetch(() => rpcOutput(WRITTEN_TODAY))
    const packs: readonly CharacterPackEntry[] = []
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient(), stateWith({ characterPacks: packs })),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    expect(result.current.diaryPortrait.name).toBe("架空の名前")
    expect(result.current.diaryPortrait.portrait.portraitUrl).toBeUndefined()
  })
})

describe("useAchievement（書き上げの演出）", () => {
  const JUST_WRITTEN = stateWith({
    diaryWriting: { kind: "written", date: "2026-09-24", writtenAt: 0 },
  })

  function writtenAt(time: string): DailyAchievement {
    return {
      kind: "known",
      date: "2026-09-24",
      today: "2026-09-24",
      doneTasks: [{ id: "T-1", summary: "架空のタスク" }],
      graduations: [],
      milestones: [],
      diary: {
        kind: "written",
        diary: {
          version: 1,
          date: "2026-09-24",
          paragraphs: [
            {
              writtenAt: `2026-09-24T${time}+09:00`,
              body: "架空の日記の本文。",
              expression: "proud",
              writer: { pack: "fixture-pack", name: "架空の名前" },
            },
          ],
          bookmark: { kind: "none" },
        },
      },
    }
  }

  it("書き上がった直後は真で、見せた合図のあとは同じ段落で偽に戻る", async () => {
    stubAchievementFetch(() => rpcOutput(writtenAt("20:01:00")))
    const { result, rerender } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient(), JUST_WRITTEN),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    expect(result.current.diaryReveal).toBe(true)

    act(() => {
      result.current.onDiaryRevealed()
    })
    rerender()

    expect(result.current.diaryReveal).toBe(false)
  })

  it("合図が無ければ何度描き直しても真のまま（描画は印を書かない）", async () => {
    stubAchievementFetch(() => rpcOutput(writtenAt("20:02:00")))
    const { result, rerender } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(createTestQueryClient(), JUST_WRITTEN),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })

    rerender()
    rerender()

    expect(result.current.diaryReveal).toBe(true)
  })

  it("書き足して最新の段落が変われば、見せた後でも真に戻る", async () => {
    stubAchievementFetch(() => rpcOutput(writtenAt("20:03:00")))
    const client = createTestQueryClient()
    const { result } = renderHook(() => useAchievement(), {
      wrapper: achievementWrapper(client, JUST_WRITTEN),
    })
    await waitFor(() => {
      expect(result.current.view.kind).toBe("ready")
    })
    act(() => {
      result.current.onDiaryRevealed()
    })

    fetchStub?.restore()
    stubAchievementFetch(() => rpcOutput(writtenAt("20:04:00")))
    await act(async () => {
      await client.invalidateQueries()
    })

    await waitFor(() => {
      expect(result.current.diaryReveal).toBe(true)
    })
  })
})
