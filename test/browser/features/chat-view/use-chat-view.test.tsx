import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  useChatView,
  type ChatRow,
  type ChatTimeStamp,
} from "../../../../src/browser/features/chat-view/hooks/use-chat-view.ts"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type RecordTime,
  type SessionRecord,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterInfo, shownPortraits } from "../../../fixture/character.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../session-store.ts"

/**
 * `<ChatView>` を丸ごと描かずに、表情の決め方・行への畳み方・「...」と案内の出し分け・
 * つついたときの送り先だけを測る（docs/design.md 2章「機能の中を分ける」）。行が DOM に
 * どう並ぶかは `chat-view.test.tsx`（部品ごと描画する側）が確かめる。文面は手で書いた架空のもの
 * （docs/coding-standards.md「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

const STAMPED = { kind: "stamped", at: 0 } satisfies RecordTime

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", turnId: 0, text: "1つめの依頼", images: [], time: STAMPED },
  { kind: "speech", text: "1つめのセリフ", expression: "default", time: STAMPED },
  { kind: "request", turnId: 1, text: "2つめの依頼", images: [], time: STAMPED },
  { kind: "speech", text: "2つめのセリフ", expression: "proud", time: STAMPED },
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
      records: [...RECORDS.slice(0, 2), { kind: "compact-boundary" }, ...RECORDS.slice(2)],
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
        records: [
          ...RECORDS,
          { kind: "speech", text: "3つめのセリフ", expression: "default", time: STAMPED },
        ],
        character: FIXTURE_CHARACTER,
        speechExpression: "default",
      })
    })

    expect(speechRows(result.current.rows).map((row) => row.selected)).toEqual([false, false, true])
  })
})

describe("useChatView の育つ行", () => {
  it("開いた時点で並んでいたセリフは育てず、あとから届いた末尾の1件だけを育てる", () => {
    const { store, result } = renderUseChatView({ records: RECORDS })
    expect(speechRows(result.current.rows).map((row) => row.grow)).toEqual([false, false])

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [
          ...RECORDS,
          { kind: "speech", text: "3つめのセリフ", expression: "default", time: STAMPED },
        ],
      })
    })

    expect(speechRows(result.current.rows).map((row) => row.grow)).toEqual([false, false, true])
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

    expect(sent).toEqual([{ type: "nudge" }])
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
