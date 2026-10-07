import { act, cleanup, renderHook } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useChatView,
  type ChatRow,
  type ChatTimeStamp,
} from "../../../../../../../../src/browser/components/page/conversation/components/chat-view/hooks/use-chat-view.ts"
import {
  INITIAL_SESSION_STATE,
  type RecordTime,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../../fixture/character.ts"
import { requestRecord, speechRecord } from "../../../../../../../fixture/session-record.ts"
import { putState, putSession } from "../../../../../../session-store.ts"

/**
 * `<ChatView>` を丸ごと描かずに、表情の決め方・行への畳み方・セリフを出すタイミングを測る。
 * 文面は手で書いた架空のもの
 */

afterEach(() => {
  cleanup()
})

const RECORDS: readonly SessionRecord[] = [
  requestRecord({ turnId: 0, text: "1つめの依頼" }),
  speechRecord({ text: "1つめのセリフ" }),
  requestRecord({ turnId: 1, text: "2つめの依頼" }),
  speechRecord({ text: "2つめのセリフ", expression: "proud" }),
]

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png", proud: "/character/proud.png" }),
})

function renderUseChatView(stateOverrides: Partial<SessionState>): {
  readonly result: { readonly current: ReturnType<typeof useChatView> }
} {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <>{children}</>
  }
  const { result } = renderHook(() => useChatView(), { wrapper: Wrapper })
  return { result }
}

function speechRows(rows: readonly ChatRow[]): readonly Extract<ChatRow, { kind: "speech" }>[] {
  return rows.flatMap((row) => (row.kind === "speech" ? [row] : []))
}

function localAt(isoLocal: string): RecordTime {
  return {
    kind: "stamped",
    at: Temporal.PlainDateTime.from(isoLocal).toZonedDateTime(Temporal.Now.timeZoneId())
      .epochMilliseconds,
  }
}

describe("useChatView の行への畳み方", () => {
  it("日の区切り・時刻の文字・組み直した発言の「時刻なし」を行へ畳む", () => {
    const { result } = renderUseChatView({
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "組み直した依頼",
          images: [],
          time: { kind: "restored" },
        },
        {
          kind: "speech",
          answersAside: false,
          text: "前の日のセリフ",
          expression: "default",
          time: localAt("2026-09-22T23:59:30"),
        },
        {
          kind: "request",
          turnId: 1,
          text: "次の日の依頼",
          images: [],
          time: localAt("2026-09-23T00:01"),
        },
      ],
    })

    const rows = result.current.rows
    expect(rows.map((row) => row.kind)).toEqual(["user", "day", "speech", "day", "user"])
    const [restored, firstDay, speech, secondDay] = rows
    expect(restored?.kind === "user" && restored.time).toEqual({ kind: "unknown" })
    expect(firstDay?.kind === "day" && firstDay.label).toBe("9月22日（火）")
    expect(secondDay?.kind === "day" && secondDay.label).toBe("9月23日（水）")
    expect(secondDay?.kind === "day" && secondDay.dateTime).toBe("2026-09-23")
    // 秒は出さない（`dateTime` は分までの壁時計にオフセットが付く）。
    const time: ChatTimeStamp = speech?.kind === "speech" ? speech.time : { kind: "unknown" }
    expect(time.kind === "known" && time.text).toBe("23:59")
    expect(time.kind === "known" && time.dateTime.startsWith("2026-09-22T23:59")).toBe(true)
    expect(time.kind === "known" && time.dateTime.includes("23:59:")).toBe(false)
  })
})

describe("useChatView のセリフを遡る", () => {
  it("何も押していなければ最新のセリフに印が付き、表情は speechExpression", () => {
    const { result } = renderUseChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([false, true])
    expect(result.current.expression).toBe("proud")
    expect(result.current.portraitUrl).toBe("/character/proud.png")
  })

  it("新しいセリフが来ると留めた選択は失効する", () => {
    const { result } = renderUseChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })
    act(() => {
      speechRows(result.current.rows)[0]?.onToggle()
    })

    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ" })],
        character: FIXTURE_CHARACTER,
        speechExpression: "default",
      })
    })

    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([false, false, true])
  })
})

describe("useChatView の出すタイミング（docs/architecture/screen-design.md 13.7）", () => {
  /** `Temporal.Now.instant` を差し込み、`useRevealedChatLog` が読む「いま」を固定する。 */
  function mockNow(ms: number): ReturnType<typeof vi.spyOn> {
    const clock = vi.spyOn(Temporal.Now, "instant")
    clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(ms))
    return clock
  }

  /** 偽のタイマー（`performance.now()` も偽）を入れ、`Temporal.Now.instant` を偽の `performance.now()` に写す。 */
  function mockTickingNow(): ReturnType<typeof vi.spyOn> {
    vi.useFakeTimers()
    return vi
      .spyOn(Temporal.Now, "instant")
      .mockImplementation(() =>
        Temporal.Instant.fromEpochMilliseconds(Math.floor(performance.now())),
      )
  }

  it("開いた時点で並んでいたセリフは、待たずに全部出る", () => {
    const clock = mockNow(0)
    try {
      const { result } = renderUseChatView({ records: RECORDS })

      expect(speechRows(result.current.rows)).toHaveLength(2)
      expect(result.current.showTyping).toBe(false)
    } finally {
      clock.mockRestore()
    }
  })

  it("2件のセリフが続けて届いたとき、2件目は2秒経つまでログに出ず、そのあいだ「...」が出る", () => {
    const clock = mockTickingNow()
    try {
      const { result } = renderUseChatView({ records: [] })

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ", expression: "proud" })],
          speechExpression: "proud",
          speechCalledInTurn: true,
        })
      })
      expect(speechRows(result.current.rows)).toHaveLength(1)

      // 時計は動かさないまま、続けて2件目が届く。
      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1件目の架空のセリフ", expression: "proud" }),
            speechRecord({ text: "2件目の架空のセリフ", expression: "curious" }),
          ],
          speechExpression: "curious",
          speechCalledInTurn: true,
        })
      })

      expect(speechRows(result.current.rows)).toHaveLength(1)
      expect(result.current.showTyping).toBe(true)

      // 偽の時計を2秒より先へ進める。
      act(() => {
        vi.advanceTimersByTime(2001)
      })

      expect(speechRows(result.current.rows)).toHaveLength(2)
      expect(result.current.showTyping).toBe(false)
    } finally {
      vi.useRealTimers()
      clock.mockRestore()
    }
  })

  it("前の吹き出しから2秒以上空いて届いたセリフは、すぐ出る", () => {
    const clock = mockNow(0)
    try {
      const { result } = renderUseChatView({ records: [] })

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ" })],
          speechCalledInTurn: true,
        })
      })
      expect(speechRows(result.current.rows)).toHaveLength(1)

      // 2件目が届く前に、時計を2秒より先へ進めておく。
      clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(3000))
      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1件目の架空のセリフ" }),
            speechRecord({ text: "2件目の架空のセリフ" }),
          ],
          speechCalledInTurn: true,
        })
      })

      // タイマーを待たずに、すぐ2件とも出る。
      expect(speechRows(result.current.rows)).toHaveLength(2)
    } finally {
      clock.mockRestore()
    }
  })

  it("待たせているあいだ、立ち絵の表情は出した吹き出しのもの", () => {
    const clock = mockTickingNow()
    try {
      const { result } = renderUseChatView({ records: [], character: FIXTURE_CHARACTER })

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ", expression: "proud" })],
          character: FIXTURE_CHARACTER,
          speechExpression: "proud",
          speechCalledInTurn: true,
        })
      })
      expect(result.current.expression).toBe("proud")

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1件目の架空のセリフ", expression: "proud" }),
            speechRecord({ text: "2件目の架空のセリフ", expression: "curious" }),
          ],
          character: FIXTURE_CHARACTER,
          // サーバ側はすでに届いた最新（curious）を持っているが、まだ出していない。
          speechExpression: "curious",
          speechCalledInTurn: true,
        })
      })

      expect(result.current.expression).toBe("proud")

      act(() => {
        vi.advanceTimersByTime(2001)
      })

      expect(result.current.expression).toBe("curious")
    } finally {
      vi.useRealTimers()
      clock.mockRestore()
    }
  })

  it("ターンが終わったあとも、待たせているセリフが残っていれば「...」が出続ける", () => {
    const clock = mockNow(0)
    try {
      const { result } = renderUseChatView({ records: [] })

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ" })],
          speechCalledInTurn: true,
          turn: { kind: "running", startedAt: 0 },
        })
      })

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1件目の架空のセリフ" }),
            speechRecord({ text: "2件目の架空のセリフ" }),
          ],
          speechCalledInTurn: true,
          // ターンはもう終わっている。
          turn: { kind: "finished", startedAt: 0, finishedAt: 100, ending: { kind: "ended" } },
        })
      })

      expect(speechRows(result.current.rows)).toHaveLength(1)
      expect(result.current.showTyping).toBe(true)
    } finally {
      clock.mockRestore()
    }
  })
})

describe("useChatView の「...」", () => {
  it("そのターンで既に speak が来ていれば「...」は出ない", () => {
    const { result } = renderUseChatView({
      records: RECORDS,
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: true,
    })

    expect(result.current.showTyping).toBe(false)
  })
})
