import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SidebarTaskList } from "../../../../src/browser/features/task-board/sidebar-task-list.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { putSession, type SentCommand } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のタスク。

afterEach(() => {
  cleanup()
})

function task(id: string, statusWord: string, waitingFor: readonly string[] = []): TaskSummaryItem {
  return {
    id,
    summary: `架空の${id}`,
    status: taskStatusOfWord(statusWord),
    dependencies: waitingFor,
    waitingFor,
    labels: [],
    difficulty: "sonnet",
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

const ITEMS: readonly TaskSummaryItem[] = [
  task("X-001", "todo"),
  task("X-002", "todo"),
  task("X-003", "todo", ["X-009"]),
  task("X-004", "doing"),
  task("X-005", "done"),
]

function show(
  excludedIds: readonly string[] = [],
  overrides: Partial<SessionState> = {},
): SentCommand[] {
  const sent: SentCommand[] = []
  putSession(
    { ...INITIAL_SESSION_STATE, tasks: knownTaskSummary(ITEMS), ...overrides },
    (command) => {
      sent.push(command)
    },
  )
  render(<SidebarTaskList excludedIds={excludedIds} />)
  return sent
}

describe("サイドバーのタスクの一覧", () => {
  it("着手できるものと待ちの2群に分かれ、進行中と完了は出ない", () => {
    show()

    expect(screen.getByText("着手できる 2 件")).toBeDefined()
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("X-001"),
      expect.stringContaining("X-002"),
    ])
    expect(screen.getByRole("list", { name: "待ちのタスク" }).textContent).toContain("X-003")
    expect(screen.queryByText(/X-004/)).toBeNull()
    expect(screen.queryByText(/X-005/)).toBeNull()
  })

  it("外すと指した ID は、どちらの群にも出ない", () => {
    show(["X-001", "X-003"])

    expect(screen.queryByText(/X-001/)).toBeNull()
    expect(screen.queryByText(/X-003/)).toBeNull()
    expect(screen.getAllByRole("option")).toHaveLength(1)
    expect(screen.getByRole("option").textContent).toContain("X-002")
  })

  it("「依頼」を押すと、確認なしに依頼が1回送られる", () => {
    const sent = show()

    fireEvent.click(screen.getAllByRole("button", { name: "依頼" })[1] ?? document.body)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ procedure: "session.prompt" })
    expect(String(sent[0]?.["text"])).toContain("X-002")
  })

  it("↓ で行を選び、Enter で選んだ行の依頼が1回送られる", () => {
    const sent = show()
    const list = screen.getByRole("listbox")

    fireEvent.keyDown(list, { key: "ArrowDown" })
    fireEvent.keyDown(list, { key: "Enter" })

    expect(sent).toHaveLength(1)
    expect(String(sent[0]?.["text"])).toContain("X-002")
  })

  it("ターン中は「依頼」が押せず、理由が title に出る", () => {
    const sent = show([], { turn: { kind: "running", startedAt: 0 } })
    const button = screen.getAllByRole("button", { name: "依頼" })[0] ?? document.body

    fireEvent.click(button)
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" })

    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.getAttribute("title")).toBe("ターン中は依頼できない")
    expect(sent).toEqual([])
  })

  it("タスクの置き場が無いときは、その1行だけを出す", () => {
    putSession({ ...INITIAL_SESSION_STATE, tasks: { kind: "no-beads" } })
    render(<SidebarTaskList excludedIds={[]} />)

    expect(screen.getByText("このリポジトリにはタスクの置き場が無い")).toBeDefined()
    expect(screen.queryByRole("listbox")).toBeNull()
  })
})
