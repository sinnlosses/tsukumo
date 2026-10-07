import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ChatView } from "../../../../../../../src/browser/components/page/conversation/components/chat-view/chat-view.tsx"
import type { Expression } from "../../../../../../../src/shared/character-pack/expression.ts"
import {
  INITIAL_SESSION_STATE,
  type RecordTime,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import {
  detailRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { type CommandSpy, putState, putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 並びの規則（古い→新しい・交互）は `chatLogRows` が決めるので、ここでは
// その順が DOM の順にそのまま出ることだけを見る（`column-reverse` などで
// 見かけを反転していない）。文面は手で書いた架空のもの。

const RECORDS: readonly SessionRecord[] = [
  requestRecord({ turnId: 0, text: "1つめの依頼" }),
  speechRecord({ text: "1つめのセリフ" }),
  requestRecord({ turnId: 1, text: "2つめの依頼" }),
  speechRecord({ text: "2つめのセリフ", expression: "proud" }),
]

// 立ち絵（`<Portrait>`）は `useQuery` を使うので `QueryClientProvider` が要る。表情を見る
// テストだけがキャラクター定義を差し込む（定義が無いと立ち絵そのものが出ない）。
function renderChatView(stateOverrides: Partial<SessionState>, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, spy)
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ChatView />
    </QueryClientProvider>,
  )
}

/** 立ち絵にいま当たっている表情（`<Portrait>` が `data-expression` に出す）。 */
function portraitExpression(): string | null | undefined {
  return document.querySelector("[data-expression]")?.getAttribute("data-expression")
}

/** ログの行。押せる行（キャラクターのセリフ）は `role="button"` の `<div>` で出る。 */
function logEntries(): readonly Element[] {
  return [...document.querySelectorAll("[data-speaker]")]
}

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
})

describe("ChatView", () => {
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
    // 最初の一言を促すのはこの文面（促す操作子は立ち絵へ移った。docs/architecture/screen-design.md「雑談モードの画面」）。
    expect(
      screen.getByText("（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"),
    ).toBeTruthy()
  })
})

describe("ChatView の時刻と日の区切り", () => {
  // 時刻はこのマシンのタイムゾーンの壁時計で組む（部品は OS のタイムゾーンで出すので、
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
          answersAside: false,
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
          answersAside: false,
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
          answersAside: false,
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
          answersAside: false,
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
})

describe("ChatView のセリフを遡る", () => {
  it("過去のセリフの行を押すと、立ち絵の表情がその行のものになり、同じ行をもう一度押すと最新へ戻る", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.click(firstSpeech)

    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
    expect(document.querySelector(".portrait-image")?.getAttribute("alt")).toBe(
      "架空の精霊（通常）",
    )

    fireEvent.click(firstSpeech)

    expect(portraitExpression()).toBe("proud")
    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([
      null,
      "false",
      null,
      "true",
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

  it("窓から古い記録が落ちて並びが前へ詰まっても、選択は失効して最新へ戻る", () => {
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    fireEvent.click(screen.getByText("1つめのセリフ"))
    act(() => {
      putState({
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
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    fireEvent.click(screen.getByText("2つめのセリフ"))
    act(() => {
      putState({
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

describe("ChatView のセリフが現れる（docs/architecture/screen-design.md「雑談モードの画面」）", () => {
  /** 弾む行（`ChatSpeech` が出すクラス）。 */
  function popEntries(): readonly Element[] {
    return [...document.querySelectorAll(".chat-entry-pop")]
  }

  /** 3件目のセリフが届いたところ（2件目までは開いた時点で並んでいる）。 */
  function arrive(text: string, expression: Expression): void {
    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, speechRecord({ text, expression })],
        character: FIXTURE_CHARACTER,
        speechExpression: expression,
      })
    })
  }

  // 弾む動き自体（CSS のアニメーション）はここでは見ない——見えるかどうかは目視で確かめる
  // （docs/architecture/testing.md「手で確かめること」）。ここで守るのは、届いたばかりのセリフが
  // 全文でその場に出て、`.chat-entry-pop` が掛かる行の配線。

  it("届いたばかりのセリフは全文で出て、弾む行になる", () => {
    renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    arrive("3つめのセリフ", "curious")

    expect(logEntries()).toHaveLength(5)
    expect(screen.getByText("3つめのセリフ")).toBeTruthy()
    expect(popEntries()).toHaveLength(1)
  })
})

describe("ChatView の「...」（返事を待つ間）", () => {
  /** 「...」の行（`ChatTyping`。docs/architecture/screen-design.md「雑談モードの画面」）。 */
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

describe("ChatView の立ち絵をつつく", () => {
  /** 載せたときに出る案内の字（`NudgePortrait` が持つ。docs/architecture/screen-design.md「雑談モードの画面」）。 */
  const NUDGE_HINT = "話しかけてもらう"

  /**
   * つつける立ち絵。探すのは案内の側（`aria-describedby`）— ログのセリフの行も
   * `role="button"` なので、名前（＝立ち絵の alt）ではなく説明で見分ける。
   */
  function portraitButton(): HTMLElement {
    return screen.getByRole("button", { description: NUDGE_HINT })
  }

  /**
   * ターン進行中の立ち絵。案内ごと消えるので説明では見分けられず、中の立ち絵
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

    // 送るのは押した事実だけ（文面は `CHAT_NUDGE_PROMPT` が持つ）。
    expect(sent).toEqual([{ procedure: "session.nudge" }])
  })

  it("ターン進行中は押せない（返事を待つ）", () => {
    const sent: unknown[] = []
    renderChatView(
      { records: RECORDS, character: FIXTURE_CHARACTER, turn: { kind: "running", startedAt: 0 } },
      (command) => sent.push(command),
    )

    // `disabled` にはしない（キーボードで辿り着ける道ごと消える）。押せないことは
    // `aria-disabled` で伝え、案内は出さない（`docs/architecture/screen-design.md`「雑談モードの画面」）。
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
