import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { ChatView } from "../../../../src/browser/features/chat-view/chat-view.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 並びの規則（古い→新しい・交互）は `shared/chat-log.ts` が決めるので、ここでは
// **その順が DOM の順にそのまま出る**ことだけを見る（`column-reverse` などで
// 見かけを反転していない）。文面は手で書いた架空のもの。

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", text: "1つめの依頼" },
  { kind: "speech", text: "1つめのセリフ", expression: "default" },
  { kind: "request", text: "2つめの依頼" },
  { kind: "speech", text: "2つめのセリフ", expression: "proud" },
]

function renderChatView(stateOverrides: Partial<SessionState>): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, () => {})
  render(
    <SessionStoreContext.Provider value={store}>
      <ChatView />
    </SessionStoreContext.Provider>,
  )
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
        { kind: "request", text: "架空の依頼" },
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
})
