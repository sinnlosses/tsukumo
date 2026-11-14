// 雑談中の欄外の「覚えていること」「最近の話題」（docs/architecture/chat-mode.md「雑談モード」）。

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ChatMemory } from "../../../../../../../src/browser/components/page/conversation/components/chat-memory/chat-memory.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderChatMemory(stateOverrides: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, chatMode: true, ...stateOverrides }, () => {})
  render(<ChatMemory />)
}

describe("ChatMemory", () => {
  it("覚えていることが空のときは案内を出す", () => {
    renderChatMemory({})

    expect(screen.getByText("まだ覚えていることが無い")).toBeDefined()
  })

  it("最近の話題は、届いた見出しを届いた順（新しい順）に並べ、案内は出さない", () => {
    renderChatMemory({
      chatTopics: ["架空の新しい話題", "架空の二番目の話題", "架空の三番目の話題"],
    })

    const topics = screen.getByRole("list", { name: "最近の話題" })
    expect(Array.from(topics.querySelectorAll("li")).map((item) => item.textContent)).toEqual([
      "架空の新しい話題",
      "架空の二番目の話題",
      "架空の三番目の話題",
    ])
    expect(screen.queryByText(/まだ話題が無い/u)).toBeNull()
  })

  it("定着を止めていなければ、止めた旨の1行は出さない", () => {
    renderChatMemory({})
    expect(screen.queryByText(/雑談の記憶の畳みを止めた/u)).toBeNull()
  })

  it("定着を止めていれば、止めた旨の1行を最近の話題に出す", () => {
    renderChatMemory({ chatConsolidationHalt: { halted: true, failures: 3 } })
    expect(screen.getByText("雑談の記憶の畳みを止めた（3 回続けて失敗）")).toBeDefined()
  })
})
