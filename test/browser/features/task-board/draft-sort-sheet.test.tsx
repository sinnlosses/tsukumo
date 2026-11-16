import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import { useTaskSheet } from "../../../../src/browser/stores/task-sheet.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../query-client.tsx"
import { type CommandSpy, putSession } from "../../session-store.ts"
import { TaskList, sheet } from "./task-list-harness.tsx"

// サイドシートのドラフトの分類の場面と、まとめて頼む流れ。
// フィクスチャはすべて手で書いた架空のタスク。

afterEach(() => {
  cleanup()
  useTaskSheet.setState(useTaskSheet.getInitialState(), true)
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
    importance: "normal",
    urgency: "normal",
    body: "## 目的\n\n架空の本文の頭",
    location: { kind: "none" },
  }
}

const TASKS = [
  taskOf("X-002", "todo"),
  taskOf("X-004", "draft"),
  taskOf("X-005", "draft"),
  taskOf("X-006", "draft"),
]

function renderSort(spy: CommandSpy = () => {}, overrides: Partial<SessionState> = {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...overrides }, spy)
  render(<TaskList tasks={knownTaskSummary(TASKS)} />, { wrapper: queryClientWrapper() })
  fireEvent.click(screen.getByRole("button", { name: /仕分ける/ }))
}

function collectInto(sent: unknown[]): CommandSpy {
  return (command) => {
    sent.push(command)
  }
}

function confirmDialog(): Element | null {
  return document.querySelector("dialog.task-run-confirm")
}

function confirmDialogElement(): HTMLElement {
  const dialog = confirmDialog()
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("確認が開いているはず")
  }
  return dialog
}

function chooseSort(taskId: string, label: string): void {
  const group = screen.getByRole("radiogroup", { name: `${taskId} の仕分け` })
  fireEvent.click(within(group).getByRole("radio", { name: new RegExp(label) }))
}

function isLater(taskId: string): boolean {
  const group = screen.getByRole("radiogroup", { name: `${taskId} の仕分け` })
  return (
    within(group)
      .getByRole("radio", { name: /あとで/ })
      .getAttribute("aria-checked") === "true"
  )
}

describe("ドラフトの分類（サイドシート）", () => {
  it("ドラフトの全件が札で並び、既定は「あとで」。選びが無いうちは頼む口が押せない", () => {
    renderSort()
    expect(sheet()?.textContent).toContain("ドラフトを仕分ける")
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3)
    expect(sheet()?.textContent).toContain("架空の本文の頭")
    expect(isLater("X-004")).toBe(true)
    expect(sheet()?.textContent).toContain("あとで 3 件")
    expect(screen.getByRole("button", { name: "頼む" }).getAttribute("aria-disabled")).toBe("true")
  })

  it("計画と却下を選ぶと、口の語に件数が出て、あとでの件数が減る", () => {
    renderSort()
    chooseSort("X-004", "計画")
    chooseSort("X-005", "却下")

    expect(screen.getByRole("button", { name: "計画 1・却下 1 を頼む" })).toBeDefined()
    expect(sheet()?.textContent).toContain("あとで 1 件")
  })

  it("却下を選んだ札にだけ理由の欄が出る", () => {
    renderSort()
    expect(screen.queryByLabelText("却下の理由")).toBeNull()

    chooseSort("X-005", "却下")
    expect(screen.getAllByLabelText("却下の理由")).toHaveLength(1)
    chooseSort("X-005", "あとで")
    expect(screen.queryByLabelText("却下の理由")).toBeNull()
  })

  it("「仕分けを戻す」で全部あとでに戻る", () => {
    renderSort()
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "仕分けを戻す" }))

    expect(isLater("X-004")).toBe(true)
    expect(screen.queryByRole("button", { name: "仕分けを戻す" })).toBeNull()
  })

  it("口は確認を開き、仕分けるで1通を送って閉じる。あとでの行は文面に入らない", () => {
    const sent: unknown[] = []
    renderSort(collectInto(sent))
    chooseSort("X-004", "計画")
    chooseSort("X-005", "却下")
    fireEvent.change(screen.getByLabelText("却下の理由"), { target: { value: "重複" } })

    fireEvent.click(screen.getByRole("button", { name: "計画 1・却下 1 を頼む" }))
    expect(confirmDialog()?.textContent).toContain("ドラフト 2 件を仕分けますか")
    fireEvent.click(within(confirmDialogElement()).getByRole("button", { name: "仕分ける" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "/plan-tasks ドラフトを仕分けた。計画（承認済み）: X-004。却下: X-005（重複）",
        images: [],
      },
    ])
    expect(sheet()).toBeNull()
  })

  it("キャンセルでは何も送らず、選びも残る", () => {
    const sent: unknown[] = []
    renderSort(collectInto(sent))
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "計画 1 を頼む" }))
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(sent).toEqual([])
    expect(screen.getByRole("button", { name: "計画 1 を頼む" })).toBeDefined()
  })

  it("閉じると選びは初めに戻る", () => {
    renderSort()
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(sheet()).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /仕分ける/ }))
    expect(isLater("X-004")).toBe(true)
  })

  it("ターンが動いている間は確認が断りを出し、送らない", () => {
    renderSort(() => {}, RUNNING_TURN)
    chooseSort("X-004", "計画")
    fireEvent.click(screen.getByRole("button", { name: "計画 1 を頼む" }))

    expect(confirmDialog()?.textContent).toContain("いまターンが動いているので送れない")
    expect(within(confirmDialogElement()).queryByRole("button", { name: "仕分ける" })).toBeNull()
  })
})

describe("タスクのモーダル", () => {
  it("絞り込み「ドラフト」でも、行ごとの3択と下端の仕分けの帯は出ない", () => {
    putSession(INITIAL_SESSION_STATE, () => {})
    render(
      <TaskBoard
        tasks={knownTaskSummary(TASKS)}
        request={{ kind: "open", focus: { kind: "first" }, query: "" }}
        onClose={() => {}}
      />,
      { wrapper: queryClientWrapper() },
    )
    fireEvent.click(screen.getByRole("button", { name: /^ドラフト/ }))

    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("button", { name: /を頼む/ })).toBeNull()
    expect(screen.getByRole("button", { name: "計画する" })).toBeDefined()
  })
})
