import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { type TaskSummaryItem } from "../../../src/protocol/task-summary.ts"
import { TaskList, taskListTitle } from "../../../src/ui/sidebar/task-list.tsx"

// フィクスチャはすべて手で書いた架空のタスク（develop/tasks.json の内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

afterEach(() => {
  cleanup()
})

const TASKS: readonly TaskSummaryItem[] = [
  { id: "X-001", summary: "架空のタスク1", status: "todo" },
  { id: "X-002", summary: "架空のタスク2", status: "done" },
  { id: "X-003", summary: "架空のタスク3", status: undefined },
]

// 畳んだ状態（done を除いた先頭3件）の境目を測るための並び。**ファイルの順は
// todo / done / doing が混ざったまま**にして、畳んでも並べ替えないことを見る。
const MANY_TASKS: readonly TaskSummaryItem[] = [
  { id: "X-101", summary: "架空のタスク101", status: "done" },
  { id: "X-102", summary: "架空のタスク102", status: "todo" },
  { id: "X-103", summary: "架空のタスク103", status: "doing" },
  { id: "X-104", summary: "架空のタスク104", status: "done" },
  { id: "X-105", summary: "架空のタスク105", status: "todo" },
  { id: "X-106", summary: "架空のタスク106", status: "todo" },
]

describe("taskListTitle", () => {
  it("tasks が undefined のときは件数を添えない", () => {
    expect(taskListTitle(undefined)).toBe("タスク一覧")
  })

  it("todo / done の件数を添える", () => {
    expect(taskListTitle(TASKS)).toBe("タスク一覧 todo 1 / done 1")
  })
})

describe("TaskList（開いた状態）", () => {
  it("tasks が undefined のときは一覧の代わりに「不明」を出す", () => {
    render(<TaskList tasks={undefined} expanded={true} />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={[]} expanded={true} />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })

  it("status のバッジ付きで、ファイルの順に出る", () => {
    render(<TaskList tasks={TASKS} expanded={true} />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain("X-001")
    expect(items[0]?.textContent).toContain("架空のタスク1")

    const badge = items[0]?.querySelector(".task-status")
    expect(badge?.textContent).toBe("todo")
    expect(badge?.className).toContain("task-status-todo")
  })

  it("done は薄く出すクラスを持つ", () => {
    render(<TaskList tasks={TASKS} expanded={true} />)

    const items = screen.getAllByRole("listitem")
    expect(items[1]?.className).toContain("task-done")
    expect(items[0]?.className).not.toContain("task-done")
  })

  it("status が無い要素はバッジを出さない", () => {
    render(<TaskList tasks={TASKS} expanded={true} />)

    const items = screen.getAllByRole("listitem")
    expect(items[2]?.querySelector(".task-status")).toBeNull()
  })

  it("done も含めて全件をファイルの順で出し、残りの件数は添えない", () => {
    render(<TaskList tasks={MANY_TASKS} expanded={true} />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(6)
    expect(items[0]?.textContent).toContain("X-101")
    expect(items[0]?.className).toContain("task-done")
    expect(items[5]?.textContent).toContain("X-106")
    expect(screen.queryByText(/^ほか /)).toBeNull()
  })
})

describe("TaskList（畳んだ状態）", () => {
  it("done を除いた先頭3件だけをファイルの順で出す", () => {
    render(<TaskList tasks={MANY_TASKS} expanded={false} />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain("X-102")
    expect(items[1]?.textContent).toContain("X-103")
    expect(items[2]?.textContent).toContain("X-105")
  })

  it("出していない残りの件数を1行添える", () => {
    render(<TaskList tasks={MANY_TASKS} expanded={false} />)

    expect(screen.getByText("ほか 3 件")).toBeDefined()
  })

  it("全件が出きるときは残りの件数を添えない", () => {
    render(
      <TaskList
        tasks={[{ id: "X-201", summary: "架空のタスク201", status: "todo" }]}
        expanded={false}
      />,
    )

    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.queryByText(/^ほか /)).toBeNull()
  })

  it("done しか無いときは行を出さず、残りの件数だけを出す", () => {
    render(
      <TaskList
        tasks={[{ id: "X-301", summary: "架空のタスク301", status: "done" }]}
        expanded={false}
      />,
    )

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(screen.getByText("ほか 1 件")).toBeDefined()
  })

  it("tasks が undefined のときは畳んでいても「不明」を出す", () => {
    render(<TaskList tasks={undefined} expanded={false} />)

    expect(screen.getByText("不明")).toBeDefined()
  })
})
