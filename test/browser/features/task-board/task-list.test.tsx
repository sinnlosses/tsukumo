import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/components/deferred-task-body.tsx"
import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import { useTaskBoardRequest } from "../../../../src/browser/stores/task-board-request.ts"
import {
  hasTaskStatus,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（タスクファイルの内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
  useTaskBoardRequest.setState(useTaskBoardRequest.getInitialState(), true)
})

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return knownTaskSummary(items)
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空のタスク1",
    status: taskStatusOfWord("todo"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-002",
    summary: "架空のタスク2",
    status: taskStatusOfWord("done"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-003",
    summary: "架空のタスク3",
    status: taskStatusOfWord(undefined),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-004",
    summary: "架空のタスク4",
    status: taskStatusOfWord("doing"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  },
]

describe("taskList", () => {
  it("tasks が不明のときは一覧の代わりに「不明」を出す", () => {
    render(<TaskList tasks={{ kind: "unknown" }} selectedStatus="all" />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("tasks が読み込み中のときはスケルトンを出し、「不明」は出さない", () => {
    render(<TaskList tasks={{ kind: "loading" }} selectedStatus="all" />)

    expect(screen.getByRole("status", { name: "タスクを読み込み中" })).toBeDefined()
    expect(screen.queryByText("不明")).toBeNull()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={known([])} selectedStatus="all" />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })

  it.each([
    { status: "todo", mark: "todo", done: false },
    { status: "draft", mark: "draft", done: false },
    { status: "done", mark: "done", done: true },
    { status: "archived", mark: "other", done: false },
    { status: undefined, mark: undefined, done: false },
  ])("status が $status の行は印が $mark だけで、薄く打ち消すのは $done", (expected) => {
    const items = [{ ...taskOf("X-010", "todo"), status: taskStatusOfWord(expected.status) }]
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

    const item = screen.getByRole("listitem")
    for (const mark of ["todo", "draft", "done", "other"]) {
      expect(item.querySelector(`.task-mark-${mark}`) !== null).toBe(mark === expected.mark)
    }
    expect(item.className.includes("task-done")).toBe(expected.done)
  })

  it("ドラフトで絞ると他の行は消える", () => {
    const draft: TaskSummaryItem = { ...TASKS[0]!, id: "X-009", status: taskStatusOfWord("draft") }
    render(<TaskList tasks={known([...TASKS, draft])} selectedStatus="draft" />)

    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("X-009")).toBeDefined()
  })

  it("絞った結果が0件のときは選んだ状態の名前を添えた一言を出す", () => {
    const doneOnly = TASKS.filter((task) => hasTaskStatus(task, "done"))
    render(<TaskList tasks={known(doneOnly)} selectedStatus="open" />)

    expect(screen.getByText("未完了のタスクが無い")).toBeDefined()
  })

  it("行を押すとのぞき窓が開き、もう一度押すと閉じる", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-001"))
    expect(row("X-001").getAttribute("aria-expanded")).toBe("true")
    expect(peekTitle()).toBe("X-001 の詳細")
    expect(peek()?.textContent).toContain("未着手")
    expect(peek()?.textContent).toContain("架空のタスク1")

    fireEvent.click(row("X-001"))
    expect(row("X-001").getAttribute("aria-expanded")).toBe("false")
    expect(peek()).toBeNull()
  })

  it("のぞき窓は状態・ID・題・本文の頭・「全文を開く」を持ち、作った人とラベルは出さない", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        ...taskOf("X-007", "todo"),
        summary: "架空の題",
        labels: ["loopable:Y"],
        body: "架空の本文の頭。\n\n架空の続き。",
      },
    ]
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

    fireEvent.click(row("X-007"))

    const text = peek()?.textContent ?? ""
    for (const part of ["未着手", "X-007", "架空の題", "架空の本文の頭。", "全文を開く"]) {
      expect(text).toContain(part)
    }
    expect(text).not.toContain("作った")
    expect(text).not.toContain("loopable:Y")
  })

  it("行には難しさ・loopable・ラベルを、アイコンでも字でも出さない", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        ...taskOf("X-011", "todo"),
        difficulty: "sonnet",
        loopable: "Y",
        labels: ["任意のタグ"],
      },
      { ...taskOf("X-012", "todo"), difficulty: "opus", loopable: "N" },
    ]
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

    for (const id of ["X-011", "X-012"]) {
      expect(row(id).querySelector("[role='img'], [data-attribute]")).toBeNull()
    }
    for (const word of ["sonnet", "opus", "loop", "任意のタグ"]) {
      expect(row("X-011").textContent).not.toContain(word)
      expect(row("X-012").textContent).not.toContain(word)
    }
  })

  it("進行中のカードを押しても同じ窓が開く", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-004"))

    expect(peekTitle()).toBe("X-004 の詳細")
    expect(peek()?.textContent).toContain("進行中")
  })

  it("依存があるときだけ関わるタスクを出す", () => {
    const items: readonly TaskSummaryItem[] = [
      ...TASKS,
      { ...taskOf("X-005", "todo"), dependencies: ["X-001", "X-009"], waitingFor: ["X-001"] },
    ]
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

    fireEvent.click(row("X-001"))
    expect(peek()?.textContent).not.toContain("関わる")

    fireEvent.click(row("X-005"))
    expect(peek()?.textContent).toContain("関わる X-001, X-009")
  })

  it("開いている間は ↑↓ で隣の行へ移り、端では止まる", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-001"))
    fireEvent.keyDown(row("X-001"), { key: "ArrowDown" })
    expect(peekTitle()).toBe("X-002 の詳細")
    expect(document.activeElement).toBe(row("X-002"))

    fireEvent.keyDown(row("X-002"), { key: "ArrowUp" })
    fireEvent.keyDown(row("X-001"), { key: "ArrowUp" })
    expect(peekTitle()).toBe("X-004 の詳細")
    fireEvent.keyDown(row("X-004"), { key: "ArrowUp" })
    expect(peekTitle()).toBe("X-004 の詳細")
  })

  it("閉じている間の ↑↓ では窓を開かない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.keyDown(row("X-001"), { key: "ArrowDown" })

    expect(peek()).toBeNull()
  })

  it("Esc と「×」で閉じ、押した行へフォーカスを戻す", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-001"))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(row("X-001"))

    fireEvent.click(row("X-002"))
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(row("X-002"))
  })

  it("開いている行が絞り込みで消えたら閉じ、戻しても開き直さない", () => {
    const { rerender } = render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-001"))
    rerender(<TaskList tasks={known(TASKS)} selectedStatus="done" />)
    expect(peek()).toBeNull()

    rerender(<TaskList tasks={known(TASKS)} selectedStatus="all" />)
    expect(peek()).toBeNull()
  })

  it("「全文を開く」はタスクのモーダルをそのタスクを選んで開くよう頼み、窓を閉じる", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    fireEvent.click(row("X-002"))
    fireEvent.click(screen.getByRole("button", { name: "全文を開く ↗" }))

    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "X-002" },
    })
    expect(peek()).toBeNull()
  })
})

/** 行（カード）のボタン。 */
function row(id: string): HTMLElement {
  const element = document.getElementById(`task-row-${id}`)
  if (element === null) {
    throw new Error(`${id} の行が無い`)
  }
  return element
}

/** 開いているのぞき窓（無ければ `null`）。 */
function peek(): Element | null {
  return document.querySelector('dialog[aria-label$=" の詳細"]')
}

function peekTitle(): string | undefined {
  return peek()?.getAttribute("aria-label") ?? undefined
}

function taskOf(id: string, status: string): TaskSummaryItem {
  return {
    id,
    summary: `架空のタスク ${id}`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  }
}
