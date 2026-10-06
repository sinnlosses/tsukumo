import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Welcome } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/welcome/welcome.tsx"
import { useSessionSwitcherRequest } from "../../../../../../../../../src/browser/stores/session-switcher-request.ts"
import type { TaskSummaryItem } from "../../../../../../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../../../../../query-client.tsx"
import { type CommandSpy, putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useSessionSwitcherRequest.setState(useSessionSwitcherRequest.getInitialState(), true)
})

const READY_TASK: TaskSummaryItem = {
  id: "X-1",
  summary: "架空のタスク",
  status: "todo",
  difficulty: "sonnet",
  loopable: "Y",
  dependencies: [],
  assignee: undefined,
  body: "",
  location: { kind: "none" },
}

/** 着手できるタスクが1件と、いまのセッションの前のセッションが1件ある帳面。 */
const FILLED: Partial<SessionState> = {
  tasks: { kind: "known", items: [READY_TASK], runPrompt: "/next-task {id}" },
  sessions: [
    {
      viewPort: 1,
      sessionId: "fake-previous",
      lastModified: 0,
      startedAt: 0,
      heading: "架空の前のやり取り",
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

    expect(calls).toEqual([{ procedure: "session.prompt", text: "X-1 に着手して", images: [] }])
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

describe("Welcome（ほかの始め方）", () => {
  it("「前のやり取りを見る」で切り替え画面を開く", () => {
    renderWelcome(FILLED)

    fireEvent.click(screen.getByRole("button", { name: /前のやり取りを見る/ }))

    expect(useSessionSwitcherRequest.getState().open).toBe(true)
  })

  it("空の帳面（タスク0件・続き無し）では札が出ず、「自分で書く」だけが大きく出て、前のやり取りの口も無い", () => {
    renderWelcome({ tasks: { kind: "known", items: [], runPrompt: "/next-task {id}" } })

    expect(document.body.querySelector("ul")).toBeNull()
    expect(
      screen.getByRole("button", { name: /自分で書く/ }).closest(".others-large"),
    ).not.toBeNull()
    expect(screen.queryByRole("button", { name: /前のやり取りを見る/ })).toBeNull()
  })
})
