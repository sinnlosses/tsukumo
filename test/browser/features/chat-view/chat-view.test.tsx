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
import { type CommandSpy, putState, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 並びの規則（古い→新しい・交互）は `shared/chat-log.ts` が決めるので、ここでは
// **その順が DOM の順にそのまま出る**ことだけを見る（`column-reverse` などで
// 見かけを反転していない）。文面は手で書いた架空のもの。

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", text: "1つめの依頼", images: [] },
  { kind: "speech", text: "1つめのセリフ", expression: "default" },
  { kind: "request", text: "2つめの依頼", images: [] },
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

/** ログの行。押せる行（キャラクターのセリフ）は `<button>` で出る。 */
function logEntries(): readonly Element[] {
  return [...document.querySelectorAll("[data-speaker]")]
}

// 手で書いた架空のキャラクター定義（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [{ name: "default", label: "通常" }],
  portraits: {
    default: "/character/default.png",
    thinking: undefined,
    proud: undefined,
    flustered: undefined,
    serious: undefined,
    curious: undefined,
    sad: undefined,
    excited: undefined,
  },
  mini: undefined,
  outfitAccents: {
    default: undefined,
    light: undefined,
    normal: undefined,
    heavy: undefined,
  },
  background: undefined,
  editable: true,
}

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
        { kind: "request", text: "架空の依頼", images: [] },
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
        { kind: "request", text: "1つめの依頼", images: [] },
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
    expect(boundary?.tagName).not.toBe("BUTTON")
  })
})

describe("ChatView のセリフを遡る", () => {
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

  it("利用者の発言の行は押せない（ボタンにしない）", () => {
    renderChatView({ records: RECORDS, character: FIXTURE_CHARACTER })

    expect(logEntries().map((entry) => entry.tagName)).toEqual(["DIV", "BUTTON", "DIV", "BUTTON"])
  })

  it("遡っている最中に新しいセリフが来ても、選んだ表情のまま動かない", () => {
    const store = renderChatView({
      records: RECORDS,
      character: FIXTURE_CHARACTER,
      speechExpression: "proud",
    })

    fireEvent.click(screen.getByText("1つめのセリフ"))
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        records: [...RECORDS, { kind: "speech", text: "3つめのセリフ", expression: "curious" }],
        character: FIXTURE_CHARACTER,
        speechExpression: "curious",
      })
    })

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
