import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../query-client.tsx"
import { type CommandSpy, putSession } from "../../session-store.ts"

// タスクのモーダルの絞り込み「ドラフト」での仕分けと、まとめて頼む流れ。
// フィクスチャはすべて手で書いた架空のタスク。

afterEach(() => {
  cleanup()
})

const RUNNING_TURN: Partial<SessionState> = { turn: { kind: "running", startedAt: 0 } }

function taskOf(id: string, word: "todo" | "draft"): TaskSummaryItem {
  return {
    id,
    summary: `架空の ${id}`,
    status: taskStatusOfWord(word),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  }
}

const DRAFTS = [
  taskOf("X-002", "todo"),
  taskOf("X-004", "draft"),
  taskOf("X-005", "draft"),
  taskOf("X-006", "draft"),
]

function renderBoard(
  spy: CommandSpy = () => {},
  closed: string[] = [],
  overrides: Partial<SessionState> = {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...overrides }, spy)
  render(
    <TaskBoard
      tasks={knownTaskSummary(DRAFTS)}
      request={{ kind: "open", focus: { kind: "first" } }}
      onClose={() => {
        closed.push("モーダル")
      }}
    />,
    { wrapper: queryClientWrapper() },
  )
}

function collectInto(sent: unknown[]): CommandSpy {
  return (command) => {
    sent.push(command)
  }
}

function confirmDialog(): Element | null {
  return document.querySelector("dialog.task-run-confirm")
}

function chooseSort(taskId: string, label: string): void {
  const group = screen.getByRole("radiogroup", { name: `${taskId} の仕分け` })
  fireEvent.click(within(group).getByRole("radio", { name: new RegExp(label) }))
}

function openDraftFilter(): void {
  fireEvent.click(screen.getByRole("button", { name: /^ドラフト/ }))
}

function isHold(taskId: string): boolean {
  const group = screen.getByRole("radiogroup", { name: `${taskId} の仕分け` })
  return (
    within(group)
      .getByRole("radio", { name: /保留/ })
      .getAttribute("aria-checked") === "true"
  )
}

describe("ドラフトの仕分け", () => {
  it("絞り込み「ドラフト」のドラフトの行にだけ3択が出て、既定は保留。選びが無いうちは帯を出さない", () => {
    renderBoard()
    expect(screen.queryByRole("radiogroup")).toBeNull()

    openDraftFilter()
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3)
    expect(isHold("X-004")).toBe(true)
    expect(screen.queryByRole("button", { name: /を頼む/ })).toBeNull()
    expect(screen.getByRole("button", { name: "計画する" })).toBeDefined()
  })

  it("1行だけ計画を選ぶと帯は「計画 1 を頼む」になり、保留の件数も出る", () => {
    renderBoard()
    openDraftFilter()
    chooseSort("X-004", "計画")

    expect(screen.getByRole("button", { name: "計画 1 を頼む" })).toBeDefined()
    expect(screen.getByText("保留の 2 件は触らない")).toBeDefined()
    expect(screen.queryByRole("button", { name: "計画する" })).toBeNull()
  })

  it("却下を選んだ行にだけ理由の欄が出る", () => {
    renderBoard()
    openDraftFilter()
    expect(screen.queryByLabelText("却下の理由:")).toBeNull()

    chooseSort("X-005", "却下")
    expect(screen.getAllByLabelText("却下の理由:")).toHaveLength(1)
    chooseSort("X-005", "保留")
    expect(screen.queryByLabelText("却下の理由:")).toBeNull()
  })

  it("「仕分けを戻す」で全部保留に戻り、帯が消える", () => {
    renderBoard()
    openDraftFilter()
    chooseSort("X-004", "計画")
    chooseSort("X-005", "却下")
    fireEvent.click(screen.getByRole("button", { name: "仕分けを戻す" }))

    expect(screen.queryByRole("button", { name: /を頼む/ })).toBeNull()
    expect(isHold("X-005")).toBe(true)
  })

  it("「頼む」は確認を開き、仕分けるで1通を送ってモーダルを閉じる。保留の行は含まない", () => {
    const sent: unknown[] = []
    const closed: string[] = []
    renderBoard(collectInto(sent), closed)
    openDraftFilter()
    chooseSort("X-004", "計画")
    chooseSort("X-005", "却下")
    fireEvent.change(screen.getByLabelText("却下の理由:"), { target: { value: "重複" } })

    fireEvent.click(screen.getByRole("button", { name: "計画 1・却下 1 を頼む" }))
    expect(confirmDialog()?.textContent).toContain("ドラフト 2 件を仕分けますか")
    fireEvent.click(screen.getByRole("button", { name: "仕分ける" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "/plan-tasks ドラフトを仕分けた。計画（承認済み）: X-004。却下: X-005（重複）",
        images: [],
      },
    ])
    expect(closed).toEqual(["モーダル"])
  })

  it("キャンセルでは何も送らず、仕分けも残る", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent))
    openDraftFilter()
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "計画 1 を頼む" }))
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(sent).toEqual([])
    expect(screen.getByRole("button", { name: "計画 1 を頼む" })).toBeDefined()
  })

  it("ターンが動いている間は確認が断りを出し、送らない", () => {
    renderBoard(() => {}, [], RUNNING_TURN)
    openDraftFilter()
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "計画 1 を頼む" }))

    expect(confirmDialog()?.textContent).toContain("いまターンが動いているので送れない")
    expect(screen.queryByRole("button", { name: "仕分ける" })).toBeNull()
  })
})
