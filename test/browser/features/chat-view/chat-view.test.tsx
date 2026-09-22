import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ChatView } from "../../../../src/browser/features/chat-view/chat-view.tsx"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
import { type Expression } from "../../../../src/shared/expression.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterInfo, portraits } from "../../../fixture/character.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 並びの規則（古い→新しい・交互）は `shared/chat-log.ts` が決めるので、ここでは
// **その順が DOM の順にそのまま出る**ことだけを見る（`column-reverse` などで
// 見かけを反転していない）。文面は手で書いた架空のもの。

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", turnId: 0, text: "1つめの依頼", images: [] },
  { kind: "speech", text: "1つめのセリフ", expression: "default" },
  { kind: "request", turnId: 1, text: "2つめの依頼", images: [] },
  { kind: "speech", text: "2つめのセリフ", expression: "proud" },
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
 * **文字をドラッグで選んだ**ことになる（`chat-view.tsx` の `isSelectionDrag`）。
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
  portraits: portraits({ default: "/character/default.png" }),
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
        { kind: "request", turnId: 2, text: "架空の依頼", images: [] },
        { kind: "detail", markdown: "## 架空のレポート" },
      ],
    })

    expect(screen.queryByText("架空のレポート")).toBe(null)
    expect(document.querySelectorAll("[data-speaker]")).toHaveLength(1)
  })

  it("まだ一度も話していなければ案内だけを出す", () => {
    renderChatView({ records: [] })

    expect(document.querySelectorAll("[data-speaker]")).toHaveLength(0)
    // **最初の一言を促すのはこの文面**（促す操作子は立ち絵へ移った。docs/design.md 13.7）。
    expect(
      screen.getByText("（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"),
    ).toBeTruthy()
  })

  it("圧縮の区切りは文言を添えない細い線1本（`<hr>`）で出し、押せない", () => {
    renderChatView({
      records: [
        { kind: "request", turnId: 3, text: "1つめの依頼", images: [] },
        { kind: "compact-boundary" },
        { kind: "speech", text: "2つめのセリフ", expression: "default" },
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

describe("ChatView のセリフを遡る", () => {
  it("何も押していなければ、最新のセリフに印が付いている", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    // 印は「立ち絵がいま従っている行」を指す（docs/design.md 13.7）。押す前から最新に付く。
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
        records: [...RECORDS, { kind: "speech", text: "3つめのセリフ", expression: "curious" }],
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
      records: [{ kind: "request", turnId: 5, text: "架空の依頼", images: [] }],
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

  it("キーボード（Enter / Space）で遡る", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    // `role="button"` の `<div>` にはブラウザが click を送らないので、キーは自前で受ける。
    fireEvent.keyDown(firstSpeech, { key: "Enter" })
    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")

    fireEvent.keyDown(firstSpeech, { key: " " })
    expect(portraitExpression()).toBe("proud")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("false")
  })

  it("遡るキー以外は何も起こさない", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.keyDown(firstSpeech, { key: "a" })
    fireEvent.keyDown(firstSpeech, { key: "ArrowDown" })

    expect(portraitExpression()).toBe("proud")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("false")
  })

  it("マウスで押しても遡る（手が動いていないとき）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    pressWithMouse(firstSpeech, 0)

    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
  })

  it("文字をドラッグで選んだだけでは遡らない（コピーしても立ち絵が動かない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    // 選び終えて手を離した瞬間にも click は飛ぶ。
    pressWithMouse(firstSpeech, 120)

    expect(portraitExpression()).toBe("proud")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("false")
  })

  it("手が数pxぶれただけなら遡る（押したつもりを取りこぼさない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    pressWithMouse(firstSpeech, 3)

    expect(portraitExpression()).toBe("default")
    expect(firstSpeech.getAttribute("aria-pressed")).toBe("true")
  })

  it("マウスから来ていない click（detail 0）は、押し始めの場所に関わらず遡る", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    // 支援技術が送る click には押し始めが無い（直前のドラッグの場所を引きずらない）。
    fireEvent.mouseDown(firstSpeech, { clientX: 20, clientY: 30 })
    fireEvent.click(firstSpeech, { clientX: 0, clientY: 0, detail: 0 })

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
        records: [...RECORDS, { kind: "speech", text: "3つめのセリフ", expression: "curious" }],
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
        records: [...RECORDS, { kind: "request", turnId: 4, text: "3つめの依頼", images: [] }],
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

describe("ChatView の末尾のセリフが育つ", () => {
  /** 育っている行（`chat-view.tsx` が出す印。docs/design.md 13.7「末尾のセリフは育つ」）。 */
  function growingEntry(): HTMLElement {
    const entry = document.querySelector("[data-growing]")
    if (!(entry instanceof HTMLElement)) {
      throw new Error("育っている行が見つからない")
    }
    return entry
  }

  /** 3件目のセリフが届いたところ（2件目までは開いた時点で並んでいる）。 */
  function arrive(store: SessionStore, text: string, expression: Expression): void {
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, { kind: "speech", text, expression }],
        character: FIXTURE_CHARACTER,
        speechExpression: expression,
      })
    })
  }

  // **1文字ずつ出るところ（速さ）はここでは見ない**——フレームの進みに乗るので、
  // 見えるかどうかは目視で確かめる（docs/architecture.md「手で確かめること」）。
  // ここで守るのは**育て始める行・打ち切る口・出し切る合図**の配線だけ。

  it("届いたばかりのセリフは、文字が出そろう前から行に出る", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    arrive(store, "3つめのセリフ", "curious")

    // 行は先に立ち、中身はこれから育つ（吹き出しが膨らむのはこの間）。
    expect(logEntries()).toHaveLength(5)
    expect(growingEntry().textContent).toBe("")
  })

  it("開いた時点で並んでいたセリフは育たない（前の雑談の続きを書き直さない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    expect(document.querySelector("[data-growing]")).toBe(null)
    expect(screen.getByText("2つめのセリフ")).toBeTruthy()
  })

  it("育っている最中に押すと、遡らずにその場で全文が出る", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })
    arrive(store, "3つめのセリフ", "curious")

    // 古い行を留めておく（押しが遡りに使われたなら、ここから表情が動く）。
    fireEvent.click(screen.getByText("1つめのセリフ"))
    expect(portraitExpression()).toBe("default")

    const growing = growingEntry()
    fireEvent.click(growing)

    expect(growing.textContent).toBe("3つめのセリフ")
    expect(growing.hasAttribute("data-growing")).toBe(false)
    // **その回の押しは打ち切りに使う**（揃うより先に留めても、何を留めたのか読めない）。
    expect(portraitExpression()).toBe("default")

    // 出し切ったあとの押しは、いつもどおり遡る。
    fireEvent.click(growing)
    expect(portraitExpression()).toBe("curious")
  })

  it("キーボード（Enter / Space）でも打ち切れる", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })
    arrive(store, "3つめのセリフ", "curious")

    const growing = growingEntry()
    fireEvent.keyDown(growing, { key: "Enter" })

    expect(growing.textContent).toBe("3つめのセリフ")
    expect(growing.hasAttribute("data-growing")).toBe(false)
  })

  it("次のセリフが来たら、育っていた行は出し切る（育つのは末尾の1件だけ）", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })
    arrive(store, "3つめのセリフ", "curious")
    const previous = growingEntry()

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [
          ...RECORDS,
          { kind: "speech", text: "3つめのセリフ", expression: "curious" },
          { kind: "speech", text: "4つめのセリフ", expression: "default" },
        ],
        character: FIXTURE_CHARACTER,
        speechExpression: "default",
      })
    })

    expect(previous.textContent).toBe("3つめのセリフ")
    expect(previous.hasAttribute("data-growing")).toBe(false)
    // 育っているのは末尾の1件だけ。
    expect(document.querySelectorAll("[data-growing]")).toHaveLength(1)
    expect(growingEntry()).not.toBe(previous)
  })
})

describe("ChatView の「...」（返事を待つ間）", () => {
  /** 「...」の行（`chat-view.tsx` の `<ChatTyping>`。docs/design.md 13.7）。 */
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
        records: [...RECORDS, { kind: "speech", text: "3つめのセリフ", expression: "curious" }],
        character: FIXTURE_CHARACTER,
        speechExpression: "curious",
        turn: { kind: "running", startedAt: 0 },
        speechCalledInTurn: true,
      })
    })

    // 入れ替わりに届いたセリフの行が育ち始める（文字はこれから出る。他の育つテストと同じ
    // 立場——1文字ずつ出るところ自体はフレームの進みに乗るので目視で確かめる）。
    expect(typingEntry()).toBe(null)
    expect(document.querySelector('[data-growing="yes"]')).toBeTruthy()
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
  /** 載せたときに出る案内の字（`chat-view.tsx` が持つ。docs/design.md 13.7）。 */
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

    // **送るのは押した事実だけ**（文面は `src/server/core/chat-nudge.ts` が持つ）。
    expect(sent).toEqual([{ type: "nudge" }])
  })

  it("押してもログには何も積まない（送った文面が並ばない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER })
    const before = logEntries().length

    fireEvent.click(portraitButton())

    // ブラウザは自分で echo しない（並ぶのはサーバから戻るセリフだけ。docs/design.md 13.7）。
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
    expect(sent).toEqual([{ type: "nudge" }])
  })

  it("ターン進行中は押せない（返事を待つ）", () => {
    const sent: unknown[] = []
    renderChatView(
      { records: RECORDS, character: FIXTURE_CHARACTER, turn: { kind: "running", startedAt: 0 } },
      (command) => sent.push(command),
    )

    // **`disabled` にはしない**（キーボードで辿り着ける道ごと消える）。押せないことは
    // `aria-disabled` で伝え、**案内は出さない**（`docs/design.md` 13.7）。
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

    expect(sent).toEqual([{ type: "nudge" }])
  })
})
