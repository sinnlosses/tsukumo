import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { PendingAnswer } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/pending-answer/pending-answer.tsx"
import { SessionStoreContext } from "../../../../../../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../../../../../../src/shared/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../../../../../../session-store.ts"

/**
 * 入力欄の上の箱は**許可要求だけ**を持つ（質問の札はメインビューへ移り、その検査は `test/browser/components/page/conversation/components/main-view/components/question-ask/question-ask.test.tsx` と
 * `test/browser/stores/question-answer.test.tsx` にある）。
 * フィクスチャはすべて手で書いた架空の許可要求（docs/coding-standards.md「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

function renderPendingAnswer(
  pending: readonly PendingAsk[],
  dispatch: CommandSpy = () => {},
): HTMLElement {
  const state: SessionState = { ...INITIAL_SESSION_STATE, pending }
  const store = sessionStoreWith(state, dispatch)
  const { container } = render(
    <SessionStoreContext.Provider value={store}>
      <PendingAnswer />
    </SessionStoreContext.Provider>,
  )
  return container
}

describe("PendingAnswer", () => {
  it("答え待ちが無いときは何も描かない", () => {
    expect(renderPendingAnswer([]).innerHTML).toBe("")
  })

  it("(7) 許可要求で「許可」「拒否」が answer を dispatch する", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [{ kind: "permission", id: "ask-1", toolName: "Bash", input: { command: "echo dummy" } }],
      (command) => calls.push(command),
    )

    expect(screen.getByText("Bash")).toBeDefined()
    fireEvent.click(screen.getByText("許可"))

    expect(calls).toEqual([{ procedure: "session.answer", id: "ask-1", answer: { kind: "allow" } }])
  })

  it("拒否ボタンも同じ経路で answer を dispatch する", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByText("拒否"))

    expect(calls).toEqual([{ procedure: "session.answer", id: "ask-1", answer: { kind: "deny" } }])
  })
})
