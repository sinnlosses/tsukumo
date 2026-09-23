import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import {
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../../src/shared/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（develop/tasks.json の内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

afterEach(() => {
  cleanup()
})

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return { kind: "known", items }
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空のタスク1",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
  },
  {
    id: "X-002",
    summary: "架空のタスク2",
    status: "done",
    difficulty: "haiku",
    loopable: "Y",
    dependencies: [],
  },
  {
    id: "X-003",
    summary: "架空のタスク3",
    status: undefined,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
  },
  {
    id: "X-004",
    summary: "架空のタスク4",
    status: "doing",
    difficulty: "sonnet",
    loopable: "N",
    dependencies: [],
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

  it("進行中（doing）はカードで先頭に出て、残りはファイルの順のまま並ぶ", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />)

    const cards = document.querySelectorAll<HTMLElement>(".task-running-card")
    expect(cards).toHaveLength(1)
    expect(cards[0]?.textContent).toContain("X-004")
    expect(cards[0]?.textContent).toContain("架空のタスク4")
    expect(cards[0]?.textContent).toContain("進行中")

    const items = screen.getAllByRole("listitem")
    // 先頭が進行中のカード、続けて doing を除いたファイルの順（X-001, X-002, X-003）。
    expect(items).toHaveLength(4)
    expect(items[0]).toBe(cards[0])
    expect(items[1]?.textContent).toContain("X-001")
    expect(items[2]?.textContent).toContain("X-002")
    expect(items[3]?.textContent).toContain("X-003")
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
      },
    ]
    render(<TaskList tasks={known(items)} selectedStatus={undefined} />)

    expect(screen.getByRole("listitem").querySelector(".task-mark-other")).not.toBeNull()
  })

  it("doing が無ければ進行中のカードを出さない", () => {
    render(
      <TaskList
        tasks={known(TASKS.filter((task) => task.status !== "doing"))}
        selectedStatus={undefined}
      />,
    )

    expect(document.querySelectorAll(".task-running-card")).toHaveLength(0)
  })

  it("selectedStatus を選ぶとその状態だけ出る（進行中カードも絞られる）", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="todo" />)

    const items = screen.getAllByRole("listitem")
    expect(document.querySelectorAll(".task-running-card")).toHaveLength(0)
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining("X-001")])
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
})
