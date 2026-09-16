import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { type TaskSummaryItem } from "../../../../src/protocol/task-summary.ts"
import { TaskList, taskListTitle } from "../../../../src/ui/features/sidebar/task-list.tsx"

// フィクスチャはすべて手で書いた架空のタスク（develop/tasks.json の内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

afterEach(() => {
  cleanup()
})

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
]

describe("taskListTitle", () => {
  it("tasks が undefined のときは件数を添えない", () => {
    expect(taskListTitle(undefined)).toBe("タスク一覧")
  })

  it("todo / done の件数を添える", () => {
    expect(taskListTitle(TASKS)).toBe("タスク一覧 todo 1 / done 1")
  })
})

describe("TaskList", () => {
  it("tasks が undefined のときは一覧の代わりに「不明」を出す", () => {
    render(<TaskList tasks={undefined} />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={[]} />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })

  it("status のバッジ付きで、全件がファイルの順に出る", () => {
    render(<TaskList tasks={TASKS} />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain("X-001")
    expect(items[0]?.textContent).toContain("架空のタスク1")

    const badge = items[0]?.querySelector(".task-status")
    expect(badge?.textContent).toBe("todo")
    expect(badge?.className).toContain("task-status-todo")
  })

  it("done は薄く出すクラスを持つ", () => {
    render(<TaskList tasks={TASKS} />)

    const items = screen.getAllByRole("listitem")
    expect(items[1]?.className).toContain("task-done")
    expect(items[0]?.className).not.toContain("task-done")
  })

  it("status が無い要素はバッジを出さない", () => {
    render(<TaskList tasks={TASKS} />)

    const items = screen.getAllByRole("listitem")
    expect(items[2]?.querySelector(".task-status")).toBeNull()
  })
})
