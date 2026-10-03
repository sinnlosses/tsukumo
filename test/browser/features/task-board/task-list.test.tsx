import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（develop/tasks.json の内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

afterEach(() => {
  cleanup()
})

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return { kind: "known", items, runPrompt: "/next-task {id}" }
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空のタスク1",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-002",
    summary: "架空のタスク2",
    status: "done",
    difficulty: "haiku",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-003",
    summary: "架空のタスク3",
    status: undefined,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-004",
    summary: "架空のタスク4",
    status: "doing",
    difficulty: "sonnet",
    loopable: "N",
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
]

describe("taskList", () => {
  it("tasks が不明のときは一覧の代わりに「不明」を出す", () => {
    render(<TaskList tasks={{ kind: "unknown" }} selectedStatus={undefined} />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={known([])} selectedStatus={undefined} />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })

  it("進行中のカードは、着手した作業ツリーが分かればその名前を添える", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        id: "X-006",
        summary: "架空の着手中",
        status: "doing",
        difficulty: undefined,
        loopable: undefined,
        dependencies: [],
        assignee: "wt-架空",
        body: "",
        location: { kind: "none" },
      },
    ]
    render(<TaskList tasks={known(items)} selectedStatus={undefined} />)

    expect(document.querySelector(".task-running-assignee")?.textContent).toBe("wt-架空")
  })

  it("着手した作業ツリーが分からない進行中のカードには名前の欄を出さない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    expect(document.querySelector(".task-running-assignee")).toBeNull()
  })

  it("todo は空の丸の印を持つ", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    const items = screen.getAllByRole("listitem")
    expect(items[1]?.querySelector(".task-mark-todo")).not.toBeNull()
  })

  it("done は薄く打ち消し線で出す", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    const items = screen.getAllByRole("listitem")
    expect(items[2]?.className).toContain("task-done")
    expect(items[2]?.querySelector(".task-mark-done")).not.toBeNull()
    expect(items[1]?.className).not.toContain("task-done")
  })

  it("status が無い要素は印を出さない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    const items = screen.getAllByRole("listitem")
    expect(items[3]?.querySelector(".task-mark-todo")).toBeNull()
    expect(items[3]?.querySelector(".task-mark-done")).toBeNull()
    expect(items[3]?.querySelector(".task-mark-other")).toBeNull()
  })

  it("想定外の status は注意色の印を出す", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        id: "X-005",
        summary: "架空のタスク5",
        status: "archived",
        difficulty: undefined,
        loopable: undefined,
        dependencies: [],
        assignee: undefined,
        body: "",
        location: { kind: "none" },
      },
    ]
    render(<TaskList tasks={known(items)} selectedStatus={undefined} />)

    expect(screen.getByRole("listitem").querySelector(".task-mark-other")).not.toBeNull()
  })

  it("進行中を選ぶとカードだけ残る", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="doing" />)

    const cards = document.querySelectorAll<HTMLElement>(".task-running-card")
    expect(cards).toHaveLength(1)
    expect(cards[0]?.textContent).toContain("X-004")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("絞った結果が0件のときは選んだ状態の名前を添えた一言を出す", () => {
    const doneOnly = TASKS.filter((task) => task.status === "done")
    render(<TaskList tasks={known(doneOnly)} selectedStatus="todo" />)

    expect(screen.getByText("未着手のタスクが無い")).toBeDefined()
  })

  it("summary を押すと aria-expanded が true になり、もう一度押すと false に戻る", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    const summaryToggle = screen.getByRole("button", { name: "架空のタスク1" })
    expect(summaryToggle.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(summaryToggle)
    expect(summaryToggle.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(summaryToggle)
    expect(summaryToggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("ID を押しても summary の開閉は変わらない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    fireEvent.click(screen.getByRole("button", { name: "X-001" }))

    expect(
      screen.getByRole("button", { name: "架空のタスク1" }).getAttribute("aria-expanded"),
    ).toBe("false")
  })
})
