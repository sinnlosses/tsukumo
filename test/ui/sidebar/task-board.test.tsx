import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { type TaskSummaryItem } from "../../../src/protocol/task-summary.ts"
import { TaskBoard } from "../../../src/ui/sidebar/task-board.tsx"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

afterEach(() => {
  cleanup()
})

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空の1件目",
    status: "done",
    difficulty: "haiku",
    loopable: "Y",
    dependencies: [],
  },
  {
    id: "X-002",
    summary: "架空の2件目",
    status: "todo",
    difficulty: "opus",
    loopable: undefined,
    dependencies: [],
  },
  {
    id: "X-003",
    summary: "架空の3件目",
    status: "todo",
    difficulty: "sonnet",
    loopable: "N",
    dependencies: ["X-002"],
  },
]

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（happy-dom も showModal() で付ける）。 */
function dialogIsOpen(): boolean {
  return document.querySelector("dialog.task-board")?.hasAttribute("open") === true
}

describe("TaskBoard", () => {
  it("open が false のときは開かない", () => {
    render(<TaskBoard tasks={TASKS} open={false} onClose={() => {}} />)

    expect(dialogIsOpen()).toBe(false)
  })

  it("open が true になると開く", () => {
    const { rerender } = render(<TaskBoard tasks={TASKS} open={false} onClose={() => {}} />)
    rerender(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    expect(dialogIsOpen()).toBe(true)
  })

  it("列は ID・status・難易度・loopable・依存・着手・要約", () => {
    render(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "ID",
      "status",
      "難易度",
      "loopable",
      "依存",
      "着手",
      "要約",
    ])
  })

  it("全件をファイルの順で出し、done も薄く出すクラス付きで残す", () => {
    render(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    const rows = document.querySelectorAll(".task-board-row")
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain("X-001")
    expect(rows[0]?.className).toContain("task-done")
    expect(rows[1]?.className).not.toContain("task-done")
  })

  it("着手可否を文字で出す（done は判定しない、依存待ちは止めている ID を並べる）", () => {
    render(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    const rows = document.querySelectorAll(".task-board-row")
    expect(rows[0]?.querySelector(".task-ready")).toBeNull()
    expect(rows[1]?.querySelector(".task-ready")?.textContent).toBe("READY")
    expect(rows[2]?.querySelector(".task-blocked")?.textContent).toBe("待ち: X-002")
  })

  it("依存・難易度・loopable が無いときは「—」で埋める", () => {
    render(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    const cells = document.querySelectorAll(".task-board-row")[1]?.querySelectorAll("td")
    expect(cells?.[1]?.textContent).toBe("opus")
    expect(cells?.[2]?.textContent).toBe("—")
    expect(cells?.[3]?.textContent).toBe("—")
  })

  it("loopable の値が付いているタスクはそのまま出す", () => {
    render(<TaskBoard tasks={TASKS} open={true} onClose={() => {}} />)

    const rows = document.querySelectorAll(".task-board-row")
    expect(rows[0]?.querySelectorAll("td")[2]?.textContent).toBe("Y")
    expect(rows[2]?.querySelectorAll("td")[2]?.textContent).toBe("N")
  })

  it("閉じるボタンで閉じる", () => {
    const closed: string[] = []
    render(
      <TaskBoard
        tasks={TASKS}
        open={true}
        onClose={() => {
          closed.push("閉じる")
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))

    expect(closed).toEqual(["閉じる"])
  })

  it("外側（backdrop）のクリックで閉じ、中身のクリックでは閉じない", () => {
    const closed: string[] = []
    render(
      <TaskBoard
        tasks={TASKS}
        open={true}
        onClose={() => {
          closed.push("外側")
        }}
      />,
    )

    const dialog = document.querySelector("dialog.task-board")
    const body = document.querySelector(".task-board-body")
    if (dialog === null || body === null) {
      throw new Error("モーダルが描かれていない")
    }

    fireEvent.click(body)
    expect(closed).toEqual([])

    fireEvent.click(dialog)
    expect(closed).toEqual(["外側"])
  })

  it("tasks が読めないときは表の代わりにその旨を出す", () => {
    render(<TaskBoard tasks={undefined} open={true} onClose={() => {}} />)

    expect(screen.getByText("develop/tasks.json が読めない")).toBeDefined()
  })

  it("タスクが0件のときは「タスクが無い」を出す", () => {
    render(<TaskBoard tasks={[]} open={true} onClose={() => {}} />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })
})
