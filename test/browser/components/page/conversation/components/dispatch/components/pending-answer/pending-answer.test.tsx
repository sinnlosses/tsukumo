import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PendingAnswer } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/pending-answer/pending-answer.tsx"
import type { PendingAsk } from "../../../../../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../../../../../../../session-store.ts"

/**
 * 入力欄の上の箱は許可要求だけを持つ（質問の札はメインビューへ移り、その検査は別のテストと
 * store のテストにある）。
 */

afterEach(() => {
  cleanup()
})

function renderPendingAnswer(
  pending: readonly PendingAsk[],
  dispatch: CommandSpy = () => {},
): HTMLElement {
  const state: SessionState = { ...INITIAL_SESSION_STATE, pending }
  putSession(state, dispatch)
  const { container } = render(<PendingAnswer />)
  return container
}

describe("PendingAnswer", () => {
  it("答え待ちが無いときは何も描かない", () => {
    expect(renderPendingAnswer([]).innerHTML).toBe("")
  })

  it("許可要求のツール名を出し、「許可」「拒否」のボタンがそれぞれ answer を送る", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [{ kind: "permission", id: "ask-1", toolName: "Bash", input: { command: "echo dummy" } }],
      (command) => calls.push(command),
    )

    expect(screen.getByText("Bash")).toBeDefined()
    fireEvent.click(screen.getByText("許可"))
    fireEvent.click(screen.getByText("拒否"))

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-1", answer: { kind: "allow" } },
      { procedure: "session.answer", id: "ask-1", answer: { kind: "deny" } },
    ])
  })
})
