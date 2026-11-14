import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Welcome } from "../../../../../../../src/browser/components/page/conversation/components/main-view/welcome.tsx"
import { useSessionSwitcherRequest } from "../../../../../../../src/browser/stores/session-switcher-request.ts"
import type { TaskSummaryItem } from "../../../../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { checkedSessionId } from "../../../../../../fixture/session-id.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { type CommandSpy, putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useSessionSwitcherRequest.setState(useSessionSwitcherRequest.getInitialState(), true)
})

const READY_TASK: TaskSummaryItem = {
  id: "X-1",
  summary: "架空のタスク",
  status: { kind: "known", status: "todo" },
  dependencies: [],
  waitingFor: [],
  labels: [],
  difficulty: undefined,
  loopable: undefined,
  importance: "normal",
  urgency: "normal",
  body: "",
  location: { kind: "none" },
}

/** 着手できるタスクが1件と、いまのセッションの前のセッションが1件ある帳面。 */
const FILLED: Partial<SessionState> = {
  tasks: { kind: "known", items: [READY_TASK], omittedClosedCount: 0 },
  sessions: [
    {
      viewPort: 1,
      sessionId: checkedSessionId("fake-previous"),
      lastModified: 0,
      startedAt: 0,
      heading: "架空の前のやり取り",
      worktree: "fictional-tree",
      inCurrentWorktree: true,
    },
  ],
}

function renderWelcome(overrides: Partial<SessionState>, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...overrides }, spy)
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Welcome />
    </QueryClientProvider>,
  )
}

describe("Welcome（キーで始める）", () => {
  it("フォーカスが入力欄の外にあるとき、キー 1 で先頭の札の依頼をすぐ送る", () => {
    const calls: unknown[] = []
    renderWelcome(FILLED, (command) => calls.push(command))

    fireEvent.keyDown(document.body, { key: "1" })

    expect(calls).toEqual([
      { procedure: "diagnostic.reportRecommendationPressed", kind: "task" },
      { procedure: "session.prompt", text: "タスク X-1 を進めて", images: [] },
    ])
  })

  it("入力欄の中のキーは字になるだけで、札は始まらない", () => {
    const calls: unknown[] = []
    renderWelcome(FILLED, (command) => calls.push(command))
    const textArea = document.createElement("textarea")
    document.body.append(textArea)

    fireEvent.keyDown(textArea, { key: "1" })

    expect(calls).toEqual([])
    textArea.remove()
  })
})

describe("Welcome（札のほかの口）", () => {
  it("札が並び、「ほかの始め方」の札は無い", () => {
    renderWelcome(FILLED)

    expect(document.body.querySelector("ul")).not.toBeNull()
    expect(screen.queryByText("ほかの始め方")).toBeNull()
    expect(screen.queryByRole("button", { name: /自分で書く/ })).toBeNull()
  })

  it("キー ← で切り替え画面を開く", () => {
    renderWelcome(FILLED)

    fireEvent.keyDown(document.body, { key: "ArrowLeft" })

    expect(useSessionSwitcherRequest.getState().open).toBe(true)
  })

  it("別の作業ツリーの行しか無いときも、キー ← で切り替え画面が開く", () => {
    const [previous] = FILLED.sessions ?? []
    renderWelcome({
      tasks: { kind: "known", items: [], omittedClosedCount: 0 },
      sessions: previous === undefined ? [] : [{ ...previous, inCurrentWorktree: false }],
    })

    fireEvent.keyDown(document.body, { key: "ArrowLeft" })

    expect(document.body.querySelector("ul")).toBeNull()
    expect(useSessionSwitcherRequest.getState().open).toBe(true)
  })

  it("空の帳面（タスク0件・続き無し）では札が出ず、一文だけ出て、前のやり取りのキーも効かない", () => {
    renderWelcome({ tasks: { kind: "known", items: [], omittedClosedCount: 0 } })

    fireEvent.keyDown(document.body, { key: "ArrowLeft" })

    expect(document.body.querySelector("ul")).toBeNull()
    expect(screen.getByText("入力欄から頼める。")).toBeTruthy()
    expect(useSessionSwitcherRequest.getState().open).toBe(false)
  })
})
