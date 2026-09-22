import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ChatView } from "../../../../src/browser/features/chat-view/chat-view.tsx"
import { SessionStoreContext, type SessionStore } from "../../../../src/browser/stores/session.tsx"
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

/**
 * ホバーで立ち絵が応えるまでの間（`chat-view.tsx` の `HOVER_PREVIEW_DELAY_MS`）を実際に待つ。
 * **時計を差し替えない** — 遅れを作っているのは素の `setTimeout` 1つで、待つ長さも
 * 0.2 秒ほどなので、そのまま待ったほうが仕掛けが少ない。
 */
async function waitForHoverPreview(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300)
    })
  })
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
    expect(screen.getByText("（まだ何も話していません）")).toBeTruthy()
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
        turnInProgress: true,
      })
    })

    expect(portraitExpression()).toBe("proud")
    expect(screen.getByText("2つめのセリフ").getAttribute("aria-pressed")).toBe("true")
  })
})

describe("ChatView のホバーで先に応える", () => {
  it("行に載せて少し待つと立ち絵がその行の表情になり、離すと戻る", async () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    // `mouseenter` / `mouseleave` は React が `mouseover` / `mouseout` から組み立てる。
    fireEvent.mouseEnter(firstSpeech)
    // 載せた直後はまだ動かない（ログの上を通り過ぎただけで点滅させない）。
    expect(portraitExpression()).toBe("proud")

    await waitForHoverPreview()
    expect(portraitExpression()).toBe("default")

    // 離すのは待たずにすぐ。
    fireEvent.mouseLeave(firstSpeech)
    expect(portraitExpression()).toBe("proud")
  })

  it("載せたまま離れた行へ滑らせても、いま載っている行の表情になる", async () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "curious" })

    const firstSpeech = screen.getByText("1つめのセリフ")
    fireEvent.mouseEnter(firstSpeech)
    fireEvent.mouseLeave(firstSpeech)
    fireEvent.mouseEnter(screen.getByText("2つめのセリフ"))

    await waitForHoverPreview()
    // 前の行の待ちは捨てられている（`default` にならない）。
    expect(portraitExpression()).toBe("proud")
  })

  it("ホバーでは印は動かない（動くのは立ち絵だけ）", async () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "proud" })

    fireEvent.mouseEnter(screen.getByText("1つめのセリフ"))
    await waitForHoverPreview()

    expect(logEntries().map((entry) => entry.getAttribute("aria-pressed"))).toEqual([
      null,
      "false",
      null,
      "true",
    ])
  })

  it("留めた行より、いま載せている行が優先される", async () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER, speechExpression: "curious" })

    fireEvent.click(screen.getByText("1つめのセリフ"))
    fireEvent.mouseEnter(screen.getByText("2つめのセリフ"))
    await waitForHoverPreview()
    expect(portraitExpression()).toBe("proud")

    // 離すと、留めた行へ戻る（最新ではない）。
    fireEvent.mouseLeave(screen.getByText("2つめのセリフ"))
    expect(portraitExpression()).toBe("default")
  })
})

describe("ChatView の話しかけてもらうボタン", () => {
  /** ボタンの字は `chat-view.tsx` が持つ（docs/design.md 13.7）。 */
  const NUDGE_LABEL = "話しかけてもらう"

  it("押すと nudge を1つ送る（文面は持たない）", () => {
    const sent: unknown[] = []
    renderChatView({ records: RECORDS }, (command) => sent.push(command))

    fireEvent.click(screen.getByRole("button", { name: NUDGE_LABEL }))

    // **送るのは押した事実だけ**（文面は `src/server/core/chat-nudge.ts` が持つ）。
    expect(sent).toEqual([{ type: "nudge" }])
  })

  it("押してもログには何も積まない（送った文面が並ばない）", () => {
    renderChatView({ records: RECORDS })
    const before = logEntries().length

    fireEvent.click(screen.getByRole("button", { name: NUDGE_LABEL }))

    // ブラウザは自分で echo しない（並ぶのはサーバから戻るセリフだけ。docs/design.md 13.7）。
    expect(logEntries()).toHaveLength(before)
  })

  it("ターン進行中は押せない（返事を待つ）", () => {
    const sent: unknown[] = []
    renderChatView({ records: RECORDS, turnInProgress: true }, (command) => sent.push(command))

    const button = screen.getByRole("button", { name: NUDGE_LABEL })
    expect(button.hasAttribute("disabled")).toBe(true)

    fireEvent.click(button)
    expect(sent).toEqual([])
  })

  it("まだ何も話していないときも出る（案内のすぐ下）", () => {
    renderChatView({ records: [] })

    expect(screen.getByRole("button", { name: NUDGE_LABEL })).toBeTruthy()
  })
})
