import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  useChatView,
  type ChatRow,
  type ChatTimeStamp,
} from "../../../../../../../src/browser/components/page/conversation/components/chat-view/hooks/use-chat-view.ts"
import {
  SessionStoreContext,
  type SessionStore,
} from "../../../../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type RecordTime,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import {
  compactBoundaryRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../../../../session-store.ts"

/**
 * `<ChatView>` を丸ごと描かずに、表情の決め方・行への畳み方・「...」と案内の出し分け・
 * つついたときの送り先だけを測る（docs/design.md 2章「機能の中を分ける」）。行が DOM に
 * どう並ぶかは `chat-view.test.tsx`（部品ごと描画する側）が確かめる。文面は手で書いた架空のもの
 * （docs/coding-standards.md「会話内容の扱い」）。
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

function renderUseChatView(
  stateOverrides: Partial<SessionState>,
  spy: CommandSpy = () => {},
): {
  readonly store: SessionStore
  readonly result: { readonly current: ReturnType<typeof useChatView> }
} {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, spy)
  function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>
  }
  const { result } = renderHook(() => useChatView(), { wrapper: Wrapper })
  return { store, result }
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

  it("圧縮の区切りは文言を持たない行になる", () => {
    const { result } = renderUseChatView({
      records: [...RECORDS.slice(0, 2), compactBoundaryRecord(), ...RECORDS.slice(2)],
    })

    expect(result.current.rows.map((row) => row.kind)).toContain("boundary")
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

  it("押すとその行へ留まり、同じ行をもう一度押すと最新へ戻る", () => {
    const { result } = renderUseChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    act(() => {
      speechRows(result.current.rows)[0]?.onToggle()
    })
    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([true, false])
    expect(result.current.expression).toBe("default")
    // alt は出ている絵をそのまま説明する。
    expect(result.current.altText).toBe("架空の精霊（通常）")

    act(() => {
      speechRows(result.current.rows)[0]?.onToggle()
    })
    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([false, true])
    expect(result.current.expression).toBe("proud")
  })

  it("新しいセリフが来ると留めた選択は失効する", () => {
    const { store, result } = renderUseChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })
    act(() => {
      speechRows(result.current.rows)[0]?.onToggle()
    })

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ" })],
        character: FIXTURE_CHARACTER,
        speechExpression: "default",
      })
    })

    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([false, false, true])
  })
})

describe("useChatView の弾む行", () => {
  it("開いた時点で並んでいた記録は弾まず、あとから届いた記録だけが弾む", () => {
    const { store, result } = renderUseChatView({ records: RECORDS })
    expect(speechRows(result.current.rows).map((row) => row.pop)).toEqual([false, false])

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ" })],
      })
    })

    expect(speechRows(result.current.rows).map((row) => row.pop)).toEqual([false, false, true])
  })
})

describe("useChatView の出すタイミング（docs/screen-design.md 13.7）", () => {
  /** `Temporal.Now.instant` を差し込み、`use-speech-reveal.ts` が読む「いま」を固定する。 */
  function mockNow(ms: number): ReturnType<typeof spyOn> {
    const clock = spyOn(Temporal.Now, "instant")
    clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(ms))
    return clock
  }

  /**
   * 偽の時計を進めたあと、それに `use-speech-reveal.ts` のポーリング（実装の詳細）が
   * 気づくまで実時間を少しだけ待つ。**2秒は待たない** —— 待つのは時計ではなくポーリングの
   * 周期ぶんだけ。
   */
  async function waitForReveal(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
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

  it("2件のセリフが続けて届いたとき、2件目は2秒経つまでログに出ず、そのあいだ「...」が出る", async () => {
    const clock = mockNow(0)
    try {
      const { store, result } = renderUseChatView({ records: [] })

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ", expression: "proud" })],
          speechExpression: "proud",
          speechCalledInTurn: true,
        })
      })
      expect(speechRows(result.current.rows)).toHaveLength(1)

      // 時計は動かさないまま、続けて2件目が届く。
      act(() => {
        putState(store, {
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
      clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(2001))
      await waitForReveal()

      expect(speechRows(result.current.rows)).toHaveLength(2)
      expect(result.current.showTyping).toBe(false)
    } finally {
      clock.mockRestore()
    }
  })

  it("前の吹き出しから2秒以上空いて届いたセリフは、すぐ出る", () => {
    const clock = mockNow(0)
    try {
      const { store, result } = renderUseChatView({ records: [] })

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ" })],
          speechCalledInTurn: true,
        })
      })
      expect(speechRows(result.current.rows)).toHaveLength(1)

      // 2件目が届く前に、時計を2秒より先へ進めておく。
      clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(3000))
      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1件目の架空のセリフ" }),
            speechRecord({ text: "2件目の架空のセリフ" }),
          ],
          speechCalledInTurn: true,
        })
      })

      // ポーリングを待たずに、すぐ2件とも出る。
      expect(speechRows(result.current.rows)).toHaveLength(2)
    } finally {
      clock.mockRestore()
    }
  })

  it("待たせているあいだ、立ち絵の表情は出した吹き出しのもの", async () => {
    const clock = mockNow(0)
    try {
      const { store, result } = renderUseChatView({ records: [], character: FIXTURE_CHARACTER })

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ", expression: "proud" })],
          character: FIXTURE_CHARACTER,
          speechExpression: "proud",
          speechCalledInTurn: true,
        })
      })
      expect(result.current.expression).toBe("proud")

      act(() => {
        putState(store, {
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

      clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(2001))
      await waitForReveal()

      expect(result.current.expression).toBe("curious")
    } finally {
      clock.mockRestore()
    }
  })

  it("ターンが終わったあとも、待たせているセリフが残っていれば「...」が出続ける", () => {
    const clock = mockNow(0)
    try {
      const { store, result } = renderUseChatView({ records: [] })

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1件目の架空のセリフ" })],
          speechCalledInTurn: true,
          turn: { kind: "running", startedAt: 0 },
        })
      })

      act(() => {
        putState(store, {
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

describe("useChatView の「...」と案内", () => {
  it("ターン進行中でまだ speak が来ていなければ「...」を出し、案内は出さない", () => {
    const { result } = renderUseChatView({
      records: [],
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: false,
    })

    expect(result.current.showTyping).toBe(true)
    expect(result.current.showEmptyMessage).toBe(false)
  })

  it("そのターンで既に speak が来ていれば「...」は出ない", () => {
    const { result } = renderUseChatView({
      records: RECORDS,
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: true,
    })

    expect(result.current.showTyping).toBe(false)
  })

  it("まだ何も話しておらずターンも動いていなければ案内を出す", () => {
    const { result } = renderUseChatView({ records: [] })

    expect(result.current.showTyping).toBe(false)
    expect(result.current.showEmptyMessage).toBe(true)
  })
})

describe("useChatView の立ち絵をつつく", () => {
  it("onNudge は nudge を1つ送る", () => {
    const sent: unknown[] = []
    const { result } = renderUseChatView({ records: RECORDS }, (command) => sent.push(command))

    result.current.onNudge()

    expect(sent).toEqual([{ procedure: "session.nudge" }])
  })

  it("ターン進行中の onNudge は何も送らない", () => {
    const sent: unknown[] = []
    const { result } = renderUseChatView(
      { records: RECORDS, turn: { kind: "running", startedAt: 0 } },
      (command) => sent.push(command),
    )

    result.current.onNudge()

    expect(sent).toEqual([])
  })
})
