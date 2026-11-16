import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { TaskItem } from "../../../../src/browser/features/task-board/components/task-item.tsx"
import { TaskState } from "../../../../src/browser/features/task-board/components/task-state.tsx"
import { loadTaskBody } from "../../../../src/browser/features/task-board/deferred-task-body.tsx"
import { taskStateOf } from "../../../../src/browser/features/task-board/domain/task-board-content.ts"
import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import { useTaskBoardRequest } from "../../../../src/browser/stores/task-board-request.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
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
    importance: "normal",
    urgency: "normal",
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
    importance: "normal",
    urgency: "normal",
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
    importance: "normal",
    urgency: "normal",
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
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  },
]

describe("taskList", () => {
  it("tasks が不明のときは一覧の代わりに「不明」を出す", () => {
    render(<TaskList tasks={{ kind: "unknown" }} />)

    expect(screen.getByText("不明")).toBeDefined()
  })

  it("tasks が読み込み中のときはスケルトンを出し、「不明」は出さない", () => {
    render(<TaskList tasks={{ kind: "loading" }} />)

    expect(screen.getByRole("status", { name: "タスクを読み込み中" })).toBeDefined()
    expect(screen.queryByText("不明")).toBeNull()
  })

  it("空配列のときは「タスクが無い」を出す", () => {
    render(<TaskList tasks={known([])} />)

    expect(screen.getByText("タスクが無い")).toBeDefined()
  })

  it.each([
    { status: "todo", hasMark: true },
    { status: "draft", hasMark: true },
    { status: "done", hasMark: true },
    { status: "archived", hasMark: true },
    { status: undefined, hasMark: false },
  ])("status が $status の行は印を出すのが $hasMark", (expected) => {
    const items = [{ ...taskOf("X-010", "todo"), status: taskStatusOfWord(expected.status) }]
    render(<TaskList tasks={known(items)} />)
    openDoneStage()

    const item = screen.getByRole("listitem")
    expect(item.querySelector("[title] svg") !== null).toBe(expected.hasMark)
  })

  it.each([
    { name: "依存待ちの todo", status: "todo", waitingFor: ["X-001"], word: "待ち X-001" },
    { name: "待ちの無い todo", status: "todo", waitingFor: [], word: "着手可" },
    { name: "hold", status: "hold", waitingFor: [], word: "保留" },
  ])("$name の行は印の title が $word で、「未着手」「依存待ち」を出さない", (expected) => {
    const items = [{ ...taskOf("X-010", expected.status), waitingFor: expected.waitingFor }]
    render(<TaskList tasks={known(items)} />)

    const item = screen.getByRole("listitem")
    expect(item.querySelector(`[title="${expected.word}"]`) !== null).toBe(true)
    expect(item.querySelector('[title="未着手"], [title="依存待ち"]')).toBeNull()
  })

  it.each([
    { status: "doing", waitingFor: [] },
    { status: "todo", waitingFor: [] },
    { status: "todo", waitingFor: ["X-001"] },
    { status: "hold", waitingFor: [] },
    { status: "draft", waitingFor: [] },
    { status: "done", waitingFor: [] },
    { status: "archived", waitingFor: [] },
  ])("$status（待ち $waitingFor）の行は、モーダルと同じ絵と同じ語を出す", (expected) => {
    const task = { ...taskOf("X-010", expected.status), waitingFor: expected.waitingFor }
    const state = taskStateOf(task)
    const { container } = render(
      <>
        <TaskItem task={task} rowId="row" peek={{ kind: "closed" }} onToggle={() => {}} />
        <div data-testid="modal-row">
          <TaskState state={state} display="labeled" />
        </div>
      </>,
    )

    const sidebarMark = container.querySelector(`[title="${state.text}"]`)
    const labeled = screen.getByTestId("modal-row").firstElementChild
    expect(sidebarMark?.querySelector("svg")?.outerHTML).toBe(
      labeled?.querySelector("svg")?.outerHTML,
    )
    expect(labeled?.textContent).toBe(state.text)
  })

  it.each([
    { name: "着手できる Y", status: "todo", waitingFor: [], loopable: "Y", loop: "ループ可" },
    { name: "依存待ちの Y", status: "todo", waitingFor: ["X-001"], loopable: "Y", loop: "waiting" },
    { name: "hold の Y", status: "hold", waitingFor: [], loopable: "Y", loop: "waiting" },
    { name: "N", status: "todo", waitingFor: [], loopable: "N", loop: "none" },
    { name: "未設定", status: "hold", waitingFor: [], loopable: undefined, loop: "none" },
    { name: "doing の Y", status: "doing", waitingFor: [], loopable: "Y", loop: "absent" },
    { name: "done の Y", status: "done", waitingFor: [], loopable: "Y", loop: "absent" },
    { name: "draft の Y", status: "draft", waitingFor: [], loopable: "Y", loop: "absent" },
  ] as const)("$name の行の ∞ 列は $loop", (expected) => {
    const items = [
      {
        ...taskOf("X-010", expected.status),
        waitingFor: expected.waitingFor,
        loopable: expected.loopable,
      },
    ]
    render(<TaskList tasks={known(items)} />)
    openDoneStage()

    const item = screen.getByRole("listitem")
    const shown = item.querySelector(".task-item-loop") !== null
    const dim = item.querySelector(".task-item-loop-waiting") !== null
    expect({ shown, dim }).toEqual({
      shown: expected.loop === "ループ可" || expected.loop === "waiting",
      dim: expected.loop === "waiting",
    })
  })

  it("段の見出しに件数を出し、0件の段は出さない", () => {
    const items = [...TASKS, taskOf("X-005", "todo")]
    render(<TaskList tasks={known(items)} />)

    const heads = screen.getAllByRole("heading", { level: 3 }).map((head) => head.textContent)
    expect(heads).toEqual(["いま1", "つぎ2", "待ち1"])
    expect(screen.getByRole("button", { name: /^済み/ }).textContent).toBe("済み1")
    expect(screen.queryByText("ドラフト")).toBeNull()
  })

  it("済みの段は閉じて始まり、見出しを押すと開き、もう一度押すと閉じる", () => {
    render(<TaskList tasks={known(TASKS)} />)
    const fold = screen.getByRole("button", { name: /^済み/ })

    expect(fold.getAttribute("aria-expanded")).toBe("false")
    expect(document.getElementById("task-row-X-002")).toBeNull()

    fireEvent.click(fold)
    expect(fold.getAttribute("aria-expanded")).toBe("true")
    expect(row("X-002")).toBeDefined()

    fireEvent.click(fold)
    expect(document.getElementById("task-row-X-002")).toBeNull()
  })

  it("行は1段目に印と題、2段目に番号を持つ", () => {
    render(<TaskList tasks={known([taskOf("X-001", "todo")])} />)

    const button = row("X-001")
    expect(button.querySelector("[title] svg")).not.toBeNull()
    expect(button.textContent).toContain("架空のタスク X-001")
    expect(button.querySelector(".task-id")?.textContent).toBe("X-001")
  })

  it("行を押すとプレビューが開き、もう一度押すと閉じる", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-001"))
    expect(row("X-001").getAttribute("aria-expanded")).toBe("true")
    expect(peekTitle()).toBe("X-001 の詳細")
    expect(peek()?.textContent).toContain("着手可")
    expect(peek()?.textContent).toContain("架空のタスク1")

    fireEvent.click(row("X-001"))
    expect(row("X-001").getAttribute("aria-expanded")).toBe("false")
    expect(peek()).toBeNull()
  })

  it("プレビューは状態・ID・題・本文の頭・「全文を開く」を持ち、作った人とラベルは出さない", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        ...taskOf("X-007", "todo"),
        summary: "架空の題",
        labels: ["loopable:Y"],
        body: "架空の本文の頭。\n\n架空の続き。",
      },
    ]
    render(<TaskList tasks={known(items)} />)

    fireEvent.click(row("X-007"))

    const text = peek()?.textContent ?? ""
    for (const part of ["着手可", "X-007", "架空の題", "架空の本文の頭。", "全文を開く"]) {
      expect(text).toContain(part)
    }
    expect(text).not.toContain("作った")
    expect(text).not.toContain("loopable:Y")
  })

  it("行の2段目には難しさの語を出し、ラベルは出さず、loopable は Y のときだけ ∞ の印で出す", () => {
    const items: readonly TaskSummaryItem[] = [
      {
        ...taskOf("X-011", "todo"),
        difficulty: "sonnet",
        loopable: "Y",
        labels: ["任意のタグ"],
      },
      { ...taskOf("X-012", "todo"), difficulty: "opus", loopable: "N" },
    ]
    render(<TaskList tasks={known(items)} />)

    expect(row("X-011").querySelector("[data-attribute='difficulty']")?.textContent).toBe("sonnet")
    expect(row("X-012").querySelector("[data-attribute='difficulty']")?.textContent).toBe("opus")
    expect(row("X-011").querySelector("[role='img']")?.getAttribute("aria-label")).toBe("ループ可")
    expect(row("X-012").querySelector("[role='img']")).toBeNull()
    expect(row("X-011").textContent).not.toContain("任意のタグ")
  })

  it("進行中の行を押しても同じプレビューが開く", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-004"))

    expect(peekTitle()).toBe("X-004 の詳細")
    expect(peek()?.textContent).toContain("進行中")
  })

  it("依存があるときだけ関わるタスクを出す", () => {
    const items: readonly TaskSummaryItem[] = [
      ...TASKS,
      { ...taskOf("X-005", "todo"), dependencies: ["X-001", "X-009"], waitingFor: ["X-001"] },
    ]
    render(<TaskList tasks={known(items)} />)

    fireEvent.click(row("X-001"))
    expect(peek()?.textContent).not.toContain("関わる")

    fireEvent.click(row("X-005"))
    expect(peek()?.textContent).toContain("関わる X-001, X-009")
  })

  it("開いている間は ↑↓ で画面の上からの順に隣の行へ移り、端では止まる", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-004"))
    fireEvent.keyDown(row("X-004"), { key: "ArrowDown" })
    expect(peekTitle()).toBe("X-001 の詳細")
    expect(document.activeElement).toBe(row("X-001"))

    fireEvent.keyDown(row("X-001"), { key: "ArrowUp" })
    expect(peekTitle()).toBe("X-004 の詳細")
    fireEvent.keyDown(row("X-004"), { key: "ArrowUp" })
    expect(peekTitle()).toBe("X-004 の詳細")
  })

  it("↑↓ は畳んだ済みの段を飛ばし、開いた済みの段へは進む", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-003"))
    fireEvent.keyDown(row("X-003"), { key: "ArrowDown" })
    expect(peekTitle()).toBe("X-003 の詳細")

    openDoneStage()
    fireEvent.keyDown(row("X-003"), { key: "ArrowDown" })
    expect(peekTitle()).toBe("X-002 の詳細")
  })

  it("閉じている間の ↑↓ ではプレビューを開かない", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.keyDown(row("X-001"), { key: "ArrowDown" })

    expect(peek()).toBeNull()
  })

  it("Esc と「×」で閉じ、押した行へフォーカスを戻す", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-001"))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(row("X-001"))

    fireEvent.click(row("X-003"))
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(row("X-003"))
  })

  it("開いている行が畳んだ段に隠れたら閉じ、開き直しても開き直さない", () => {
    render(<TaskList tasks={known(TASKS)} />)

    openDoneStage()
    fireEvent.click(row("X-002"))
    expect(peekTitle()).toBe("X-002 の詳細")

    openDoneStage()
    expect(peek()).toBeNull()

    openDoneStage()
    expect(peek()).toBeNull()
  })

  it("「全文を開く」はタスクのモーダルをそのタスクを選んで開くよう頼み、プレビューを閉じる", () => {
    render(<TaskList tasks={known(TASKS)} />)

    fireEvent.click(row("X-001"))
    fireEvent.click(screen.getByRole("button", { name: "全文を開く ↗" }))

    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "X-001" },
    })
    expect(peek()).toBeNull()
  })
})

/** 済みの段の見出しを押して開閉する。 */
function openDoneStage(): void {
  const fold = screen.queryByRole("button", { name: /^済み/ })
  if (fold !== null) {
    fireEvent.click(fold)
  }
}

/** 行のボタン。 */
function row(id: string): HTMLElement {
  const element = document.getElementById(`task-row-${id}`)
  if (element === null) {
    throw new Error(`${id} の行が無い`)
  }
  return element
}

/** 開いているプレビュー（無ければ `null`）。 */
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
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}
