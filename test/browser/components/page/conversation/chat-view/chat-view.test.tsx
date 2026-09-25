import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ChatView } from "../../../../../../src/browser/components/page/conversation/chat-view/chat-view.tsx"
import {
  SessionStoreContext,
  type SessionStore,
} from "../../../../../../src/browser/stores/session.tsx"
import { type Expression } from "../../../../../../src/shared/expression.ts"
import {
  INITIAL_SESSION_STATE,
  type RecordTime,
  type SessionRecord,
  type SessionState,
} from "../../../../../../src/shared/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../fixture/character.ts"
import {
  compactBoundaryRecord,
  detailRecord,
  requestRecord,
  speechRecord,
} from "../../../../../fixture/session-record.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 並びの規則（古い→新しい・交互）は `shared/chat-log.ts` が決めるので、ここでは
// **その順が DOM の順にそのまま出る**ことだけを見る（`column-reverse` などで
// 見かけを反転していない）。文面は手で書いた架空のもの。

const RECORDS: readonly SessionRecord[] = [
  requestRecord({ turnId: 0, text: "1つめの依頼" }),
  speechRecord({ text: "1つめのセリフ" }),
  requestRecord({ turnId: 1, text: "2つめの依頼" }),
  speechRecord({ text: "2つめのセリフ", expression: "proud" }),
]

// 立ち絵（`<Portrait>`）は `useQuery` を使うので `QueryClientProvider` が要る。表情を見る
// テストだけがキャラクター定義を差し込む（定義が無いと立ち絵そのものが出ない）。
function renderChatView(
  stateOverrides: Partial<SessionState>,
  spy: CommandSpy = () => {},
): SessionStore {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, spy)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionStoreContext.Provider value={store}>
        <ChatView />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
  return store
}

/** 立ち絵にいま当たっている表情（`<Portrait>` が `data-expression` に出す）。 */
function portraitExpression(): string | null | undefined {
  return document.querySelector("[data-expression]")?.getAttribute("data-expression")
}

/**
 * マウスで押す1回ぶん（押し始めから手を離すまで）。`moveX` だけ横に動かすと、
 * **文字をドラッグで選んだ**ことになる（`hooks/use-chat-speech.ts` の `isSelectionDrag`）。
 *
 * 文字がほんとうに選べるかはテストでは見られない（DOM の実装では選択が起きない）ので、
 * そちらは目視で確かめる（`docs/architecture.md`「手で確かめること」）。
 */
function pressWithMouse(entry: Element, moveX: number): void {
  fireEvent.mouseDown(entry, { clientX: 20, clientY: 30 })
  fireEvent.click(entry, { clientX: 20 + moveX, clientY: 30, detail: 1 })
}

/** ログの行。押せる行（キャラクターのセリフ）は `role="button"` の `<div>` で出る。 */
function logEntries(): readonly Element[] {
  return [...document.querySelectorAll("[data-speaker]")]
}

// 手で書いた架空のキャラクター定義（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
})

describe("ChatView", () => {
  it("利用者の発言とキャラクターのセリフが、古い→新しいの順に交互に積む", () => {
    renderChatView({ records: RECORDS })

    const entries = [...document.querySelectorAll("[data-speaker]")]
    expect(entries.map((entry) => entry.getAttribute("data-speaker"))).toEqual([
      "user",
      "character",
      "user",
      "character",
    ])
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "1つめの依頼",
      "1つめのセリフ",
      "2つめの依頼",
      "2つめのセリフ",
    ])
  })

  it("本文（レポート）は積まない（雑談中はレポートを出さない）", () => {
    renderChatView({
      records: [
        requestRecord({ turnId: 2, text: "架空の依頼" }),
        detailRecord("## 架空のレポート"),
      ],
    })

    expect(screen.queryByText("架空のレポート")).toBe(null)
    expect(document.querySelectorAll("[data-speaker]")).toHaveLength(1)
  })

  it("まだ一度も話していなければ案内だけを出す", () => {
    renderChatView({ records: [] })

    expect(document.querySelectorAll("[data-speaker]")).toHaveLength(0)
    // **最初の一言を促すのはこの文面**（促す操作子は立ち絵へ移った。docs/screen-design.md 13.7）。
    expect(
      screen.getByText("（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"),
    ).toBeTruthy()
  })

  it("圧縮の区切りは文言を添えない細い線1本（`<hr>`）で出し、押せない", () => {
    renderChatView({
      records: [
        requestRecord({ turnId: 3, text: "1つめの依頼" }),
        compactBoundaryRecord(),
        speechRecord({ text: "2つめのセリフ" }),
      ],
    })

    const entries = [...document.querySelectorAll("[data-speaker]")]
    expect(entries.map((entry) => entry.getAttribute("data-speaker"))).toEqual([
      "user",
      "boundary",
      "character",
    ])
    const boundary = entries[1]
    expect(boundary?.tagName).toBe("HR")
    expect(boundary?.textContent).toBe("")
    expect(boundary?.getAttribute("role")).toBe(null)
  })
})

describe("ChatView の時刻と日の区切り", () => {
  // 時刻は**このマシンのタイムゾーンの壁時計**で組む（部品は OS のタイムゾーンで出すので、
  // どこで走らせても同じ `HH:MM` と日付になる）。文面は手で書いた架空のもの。
  function localAt(isoLocal: string): RecordTime {
    return {
      kind: "stamped",
      at: Temporal.PlainDateTime.from(isoLocal).toZonedDateTime(Temporal.Now.timeZoneId())
        .epochMilliseconds,
    }
  }

  /** 発言の脇の時刻（日の区切りの中の `<time>` は除く）。 */
  function lineTimes(): readonly (string | null)[] {
    return [...document.querySelectorAll("time")]
      .filter((time) => time.closest("[data-day]") === null)
      .map((time) => time.textContent)
  }

  function dayDividers(): readonly (string | null)[] {
    return [...document.querySelectorAll("[data-day]")].map((day) => day.textContent)
  }

  it("発言ごとに、吹き出しの外へ HH:MM の時刻を添える（秒は出さない）", () => {
    renderChatView({
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "架空の依頼",
          images: [],
          time: localAt("2026-09-23T09:05:42"),
        },
        {
          kind: "speech",
          text: "架空のセリフ",
          expression: "default",
          time: localAt("2026-09-23T09:06:07"),
        },
      ],
    })

    expect(lineTimes()).toEqual(["09:05", "09:06"])
    // 時刻は吹き出しの中に入らない（セリフをコピーしたときに混ざらない）。
    expect(logEntries().map((entry) => entry.textContent)).toEqual(["架空の依頼", "架空のセリフ"])
  })

  it("日が変わらなければ区切りは入らない", () => {
    renderChatView({
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "朝の架空の依頼",
          images: [],
          time: localAt("2026-09-23T00:00"),
        },
        {
          kind: "speech",
          text: "夜の架空のセリフ",
          expression: "default",
          time: localAt("2026-09-23T23:59"),
        },
      ],
    })

    expect(dayDividers()).toEqual([])
  })

  it("日をまたぐと、日が変わった発言の手前に日付の区切りが1本だけ入る", () => {
    renderChatView({
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "前の日の架空の依頼",
          images: [],
          time: localAt("2026-09-22T23:58"),
        },
        {
          kind: "speech",
          text: "前の日の架空のセリフ",
          expression: "default",
          time: localAt("2026-09-22T23:59"),
        },
        {
          kind: "request",
          turnId: 1,
          text: "次の日の架空の依頼",
          images: [],
          time: localAt("2026-09-23T00:01"),
        },
        {
          kind: "speech",
          text: "次の日の架空のセリフ",
          expression: "default",
          time: localAt("2026-09-23T00:02"),
        },
      ],
    })

    expect(dayDividers()).toEqual(["9月23日（水）"])
    // 区切りは「次の日」の最初の発言の直前に居る。
    const divider = document.querySelector("[data-day]")
    expect(divider?.nextElementSibling?.textContent).toContain("次の日の架空の依頼")
    expect(divider?.previousElementSibling?.textContent).toContain("前の日の架空のセリフ")
  })

  it("組み直した発言（時刻が分からない）には時刻を出さず、いまの発言へ移るところで区切る", () => {
    renderChatView({
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "組み直した架空の依頼",
          images: [],
          time: { kind: "restored" },
        },
        {
          kind: "speech",
          text: "組み直した架空のセリフ",
          expression: "default",
          time: { kind: "restored" },
        },
        {
          kind: "request",
          turnId: 1,
          text: "いまの架空の依頼",
          images: [],
          time: localAt("2026-09-23T10:00"),
        },
      ],
    })

    expect(lineTimes()).toEqual(["10:00"])
    expect(dayDividers()).toEqual(["9月23日（水）"])
  })
})

describe("ChatView のセリフを遡る", () => {
  it("何も押していなければ、最新のセリフに印が付いている", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    // 印は「立ち絵がいま従っている行」を指す（docs/screen-design.md 13.7）。押す前から最新に付く。
    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([
      null,
      "false",
      null,
      "true",
    ])
  })

  it("新しいセリフが来ると、印が最新へ移る", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ", expression: "curious" })],
        character: FIXTURE_CHARACTER,
        speechExpression: "curious",
      })
    })

    // 続けて話した2件は、依頼を挟まずそのまま積む。
    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([
      null,
      "false",
      null,
      "false",
      "true",
    ])
  })

  it("まだ何も話していなければ印はどこにも付かない", () => {
    renderChatView({
      records: [requestRecord({ turnId: 5, text: "架空の依頼" })],
      character: FIXTURE_CHARACTER,
    })

    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([null])
  })

  it("過去のセリフの行を押すと、立ち絵の表情がその行のものになる", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.click(firstSpeech)

    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
  })

  it("同じ行をもう一度押すと選択が解け、最新の表情へ戻る", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.click(firstSpeech)
    fireEvent.click(firstSpeech)

    expect(portraitExpression()).toBe("proud")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("false")
  })

  it("利用者の発言の行は押せない（押せるのはキャラクターのセリフだけ）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER })

    const entries = logEntries()
    // **どちらの話者も `<div>`**（`<button>` の中の文字はドラッグで掴めないため）。
    expect(entries.map((entry) => entry.tagName)).toEqual(["DIV", "DIV", "DIV", "DIV"])
    expect(entries.map((entry) => entry.getAttribute("role"))).toEqual([
      null,
      "button",
      null,
      "button",
    ])
  })

  it("押せる行はキーボードで辿り着ける（tabindex を持つ）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER })

    expect(logEntries().map((entry) => entry.getAttribute("tabindex"))).toEqual([
      null,
      "0",
      null,
      "0",
    ])
  })

  it("キーボード（Enter）で遡る", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    // `role="button"` の `<div>` にはブラウザが click を送らないので、キーは自前で受ける。
    fireEvent.keyDown(firstSpeech, { key: "Enter" })
    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
  })

  it("マウスで押しても遡る（手が動いていないとき）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    pressWithMouse(firstSpeech, 0)

    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
  })

  it("遡っている最中に新しいセリフが来たら選択が解け、新しいセリフの表情へ戻る", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.click(firstSpeech)
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ", expression: "curious" })],
        character: FIXTURE_CHARACTER,
        speechExpression: "curious",
      })
    })

    // 立ち絵は「いまのセリフ」を表す側へ戻り、押した行の印も一緒に消える。
    expect(portraitExpression()).toBe("curious")
    expect(screen.getByText("1つめのセリフ").getAttribute("aria-pressed")).toBe("false")
  })

  it("窓から古い記録が落ちて並びが前へ詰まっても、選択は失効して最新へ戻る", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    fireEvent.click(screen.getByText("1つめのセリフ"))
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        // 古い1往復が落ちた姿（番号で持った選択が別の行を指す）。
        records: RECORDS.slice(2),
        character: FIXTURE_CHARACTER,
        speechExpression: "proud",
      })
    })

    expect(portraitExpression()).toBe("proud")
    // 留めた選択は失効し、印は残った最新のセリフへ移る。
    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([null, "true"])
  })

  it("利用者が発言しただけでは選択は解けない（解くのは新しいセリフ）", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    fireEvent.click(screen.getByText("2つめのセリフ"))
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, requestRecord({ turnId: 4, text: "3つめの依頼" })],
        character: FIXTURE_CHARACTER,
        // 送った時点でターンが始まり、最新の表情は既定へ戻っている（`beginTurn`）。
        speechExpression: INITIAL_SESSION_STATE.speechExpression,
        turn: { kind: "running", startedAt: 0 },
      })
    })

    expect(portraitExpression()).toBe("proud")
    expect(screen.getByText("2つめのセリフ").getAttribute("aria-pressed")).toBe("true")
  })
})

describe("ChatView のセリフが現れる（docs/screen-design.md 13.7）", () => {
  /** 弾む行（`components/chat-speech.tsx` が出すクラス）。 */
  function popEntries(): readonly Element[] {
    return [...document.querySelectorAll(".chat-entry-pop")]
  }

  /** 3件目のセリフが届いたところ（2件目までは開いた時点で並んでいる）。 */
  function arrive(store: SessionStore, text: string, expression: Expression): void {
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text, expression })],
        character: FIXTURE_CHARACTER,
        speechExpression: expression,
      })
    })
  }

  // **弾む動き自体（CSS のアニメーション）はここでは見ない**——見えるかどうかは目視で確かめる
  // （docs/architecture.md「手で確かめること」）。ここで守るのは、届いたばかりのセリフが
  // 全文でその場に出て、`.chat-entry-pop` が掛かる行の配線。

  it("届いたばかりのセリフは全文で出て、弾む行になる", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    arrive(store, "3つめのセリフ", "curious")

    expect(logEntries()).toHaveLength(5)
    expect(screen.getByText("3つめのセリフ")).toBeTruthy()
    expect(popEntries()).toHaveLength(1)
  })

  it("開いた時点で並んでいたセリフは弾まない（前の雑談の続きを書き直さない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    expect(popEntries()).toHaveLength(0)
    expect(screen.getByText("2つめのセリフ")).toBeTruthy()
  })

  it("続けて届いた2件目は、前の吹き出しから2秒空くまで出ない（そのあいだ「...」が出る）", async () => {
    const clock = spyOn(Temporal.Now, "instant")
    clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(0))
    try {
      const store = renderChatView({
        records: [],
        character: FIXTURE_CHARACTER,
        turn: { kind: "running", startedAt: 0 },
        speechCalledInTurn: false,
      })

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [speechRecord({ text: "1つめの架空のセリフ", expression: "proud" })],
          character: FIXTURE_CHARACTER,
          speechExpression: "proud",
          turn: { kind: "running", startedAt: 0 },
          speechCalledInTurn: true,
        })
      })
      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          records: [
            speechRecord({ text: "1つめの架空のセリフ", expression: "proud" }),
            speechRecord({ text: "2つめの架空のセリフ", expression: "curious" }),
          ],
          character: FIXTURE_CHARACTER,
          speechExpression: "curious",
          turn: { kind: "running", startedAt: 0 },
          speechCalledInTurn: true,
        })
      })

      expect(screen.queryByText("2つめの架空のセリフ")).toBe(null)
      expect(document.querySelector('[data-speaker="typing"]')).toBeTruthy()

      clock.mockReturnValue(Temporal.Instant.fromEpochMilliseconds(2001))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80))
      })

      expect(screen.getByText("2つめの架空のセリフ")).toBeTruthy()
      expect(document.querySelector('[data-speaker="typing"]')).toBe(null)
    } finally {
      clock.mockRestore()
    }
  })
})

describe("ChatView の「...」（返事を待つ間）", () => {
  /** 「...」の行（`components/chat-typing.tsx`。docs/screen-design.md 13.7）。 */
  function typingEntry(): Element | null {
    return document.querySelector('[data-speaker="typing"]')
  }

  it("ターン進行中でまだセリフが無ければ、ログの末尾に「...」が出る", () => {
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: false,
    })

    const entries = logEntries()
    // 末尾に付き、押せる行にはしない（利用者の発言の行と同じ立場）。
    expect(entries.at(-1)?.getAttribute("data-speaker")).toBe("typing")
    expect(typingEntry()?.getAttribute("role")).toBe(null)
    expect(typingEntry()?.getAttribute("tabindex")).toBe(null)
  })

  it("セリフが届くと「...」は消え、セリフの行に入れ替わる", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: false,
    })

    expect(typingEntry()).toBeTruthy()

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text: "3つめのセリフ", expression: "curious" })],
        character: FIXTURE_CHARACTER,
        speechExpression: "curious",
        turn: { kind: "running", startedAt: 0 },
        speechCalledInTurn: true,
      })
    })

    // 入れ替わりに届いたセリフの行が全文で現れる（最初の1件は前の吹き出しから
    // 待たせる根拠が無いので、待たずにすぐ出る。`use-speech-reveal.ts`）。
    expect(typingEntry()).toBe(null)
    expect(screen.getByText("3つめのセリフ")).toBeTruthy()
  })

  it("ターンが終わっていれば「...」は出ない", () => {
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
      turn: { kind: "idle" },
      speechCalledInTurn: false,
    })

    expect(typingEntry()).toBe(null)
  })

  it("その ターンで既にセリフが来ていれば「...」は出ない（次の speak を待つだけ）", () => {
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: true,
    })

    expect(typingEntry()).toBe(null)
  })

  it("ログが空でも、ターン進行中なら「...」だけを出す（案内は出さない）", () => {
    renderChatView({
      records: [],
      character: FIXTURE_CHARACTER,
      turn: { kind: "running", startedAt: 0 },
      speechCalledInTurn: false,
    })

    expect(typingEntry()).toBeTruthy()
    expect(
      screen.queryByText("（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"),
    ).toBe(null)
  })
})

describe("ChatView のホバー", () => {
  it("行に載せても立ち絵は動かない（遡るのは押したときだけ）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    // `mouseenter` / `mouseleave` は React が `mouseover` / `mouseout` から組み立てる。
    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.mouseEnter(firstSpeech)
    expect(portraitExpression()).toBe("proud")

    // 押せば遡る（ホバーだけを外したので、押す道はそのまま残っている）。
    fireEvent.click(firstSpeech)
    expect(portraitExpression()).toBe("default")
  })
})

describe("ChatView の立ち絵をつつく", () => {
  /** 載せたときに出る案内の字（`components/nudge-portrait.tsx` が持つ。docs/screen-design.md 13.7）。 */
  const NUDGE_HINT = "話しかけてもらう"

  /**
   * つつける立ち絵。**探すのは案内の側**（`aria-describedby`）— ログのセリフの行も
   * `role="button"` なので、名前（＝立ち絵の alt）ではなく説明で見分ける。
   */
  function portraitButton(): HTMLElement {
    return screen.getByRole("button", { description: NUDGE_HINT })
  }

  /**
   * ターン進行中の立ち絵。**案内ごと消える**ので説明では見分けられず、中の立ち絵
   * （`data-expression`）を持つほうのボタンを取る。
   */
  function blockedPortraitButton(): HTMLElement {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.querySelector("[data-expression]") !== null,
    )
    if (button === undefined) {
      throw new Error("つつける立ち絵が見つからない")
    }
    return button
  }

  it("立ち絵を押すと nudge を1つ送る（文面は持たない）", () => {
    const sent: unknown[] = []
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER }, (command) =>
      sent.push(command),
    )

    fireEvent.click(portraitButton())

    // **送るのは押した事実だけ**（文面は `src/server/chat/core/chat-nudge.ts` が持つ）。
    expect(sent).toEqual([{ procedure: "session.nudge" }])
  })

  it("押してもログには何も積まない（送った文面が並ばない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER })
    const before = logEntries().length

    fireEvent.click(portraitButton())

    // ブラウザは自分で echo しない（並ぶのはサーバから戻るセリフだけ。docs/screen-design.md 13.7）。
    expect(logEntries()).toHaveLength(before)
  })

  it("立ち絵を包むのは `<button>`（キーボードで押せる道をブラウザが持つ）", () => {
    const sent: unknown[] = []
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER }, (command) =>
      sent.push(command),
    )

    const button = portraitButton()
    // セリフの行（`role="button"` の `<div>`）と違い、こちらは本物の `<button>` なので
    // Enter / Space の受けを自前で足さなくてよい（ブラウザが click に変える）。
    expect(button.tagName).toBe("BUTTON")
    expect(button.getAttribute("type")).toBe("button")
    // 立ち絵はボタンの中にあり、**名前は立ち絵の alt のまま**（案内は説明の側）。
    expect(button.querySelector("[data-expression]")).toBeTruthy()
    expect(button.getAttribute("aria-label")).toBe(null)

    // キーボードの Enter がブラウザから届いたところ（＝ click）で nudge が飛ぶ。
    fireEvent.click(button, { detail: 0 })
    expect(sent).toEqual([{ procedure: "session.nudge" }])
  })

  it("ターン進行中は押せない（返事を待つ）", () => {
    const sent: unknown[] = []
    renderChatView(
      { records: RECORDS, character: FIXTURE_CHARACTER, turn: { kind: "running", startedAt: 0 } },
      (command) => sent.push(command),
    )

    // **`disabled` にはしない**（キーボードで辿り着ける道ごと消える）。押せないことは
    // `aria-disabled` で伝え、**案内は出さない**（`docs/screen-design.md` 13.7）。
    const button = blockedPortraitButton()
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.queryByText(NUDGE_HINT)).toBe(null)
    expect(button.getAttribute("aria-describedby")).toBe(null)

    fireEvent.click(button)
    expect(sent).toEqual([])
  })

  it("まだ何も話していないときもつつける（最初の一言を促せる）", () => {
    const sent: unknown[] = []
    renderChatView({ records: [], character: FIXTURE_CHARACTER }, (command) => sent.push(command))

    fireEvent.click(portraitButton())

    expect(sent).toEqual([{ procedure: "session.nudge" }])
  })
})
