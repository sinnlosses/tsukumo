import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/components/deferred-task-body.tsx"
import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import { useTaskBoardRequest } from "../../../../src/browser/stores/task-board-request.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（develop/tasks.json の内容は会話ではないが、
// テストのフィクスチャとしても実物は使わない）。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
  useTaskBoardRequest.setState(useTaskBoardRequest.getInitialState(), true)
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
    render(<TaskList tasks={{ kind: "unknown" }} selectedStatus="all" />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={known([])} selectedStatus="all" />)

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
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

    expect(document.querySelector(".task-running-assignee")?.textContent).toBe("wt-架空")
  })

  it("着手した作業ツリーが分からない進行中のカードには名前の欄を出さない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    expect(document.querySelector(".task-running-assignee")).toBeNull()
  })

  it("todo は空の丸の印を持つ", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    const items = screen.getAllByRole("listitem")
    expect(items[1]?.querySelector(".task-mark-todo")).not.toBeNull()
  })

  it("done は薄く打ち消し線で出す", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

    const items = screen.getAllByRole("listitem")
    expect(items[2]?.className).toContain("task-done")
    expect(items[2]?.querySelector(".task-mark-done")).not.toBeNull()
    expect(items[1]?.className).not.toContain("task-done")
  })

  it("status が無い要素は印を出さない", () => {
    render(<TaskList tasks={known(TASKS)} selectedStatus="all" />)

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
    render(<TaskList tasks={known(items)} selectedStatus="all" />)

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

  it("のぞき窓は状態・ID・題・本文の頭・「全文を開く」を持ち、作った人と担当は出さない", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        ...taskOf("X-007", "todo"),
        summary: "架空の題",
        assignee: "wt-架空",
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
    expect(text).not.toContain("担当")
    expect(text).not.toContain("wt-架空")
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
      { ...taskOf("X-005", "todo"), dependencies: ["X-001", "X-009"] },
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
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}
