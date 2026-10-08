import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
import { DEFAULT_RUN_PROMPT } from "../../../../src/shared/repository/project-settings.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

afterEach(() => {
  cleanup()
})

function known(
  items: readonly TaskSummaryItem[],
  runPrompt = "/next-task {id}",
): TaskSummaryResult {
  return { kind: "known", items, runPrompt }
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空の済んだタスク",
    status: "done",
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-002",
    summary: "架空の未着手タスク",
    status: "todo",
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "",
    location: { kind: "none" },
  },
]

const RUNNING_TURN: Partial<SessionState> = { turn: { kind: "running", startedAt: 0 } }

/** サイドバーの区画の一覧。確認は姿と送り口が要るので store で包む。 */
function renderList(spy: CommandSpy, overrides: Partial<SessionState>): void {
  renderWithStore(<TaskList tasks={known(TASKS)} selectedStatus="all" />, spy, overrides)
}

/** 見出しの「一覧を見る」で開くタスクのモーダル（開いた状態で描く）。閉じる要求は `closed` に溜まる。 */
function renderBoard(
  spy: CommandSpy = () => {},
  closed: string[] = [],
  tasks: readonly TaskSummaryItem[] = TASKS,
  runPrompt = "/next-task {id}",
  overrides: Partial<SessionState> = {},
): void {
  renderWithStore(
    <TaskBoard
      tasks={known(tasks, runPrompt)}
      request={{ kind: "open", focus: { kind: "first" } }}
      onClose={() => {
        closed.push("モーダル")
      }}
    />,
    spy,
    overrides,
  )
}

function renderWithStore(
  node: ReactNode,
  spy: CommandSpy,
  overrides: Partial<SessionState> = {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...overrides }, spy)
  render(<>{node}</>)
}

/** 送られたコマンドを配列に溜める受け取り口。 */
function collectInto(sent: unknown[]): CommandSpy {
  return (command) => {
    sent.push(command)
  }
}

/** 確認のモーダル（開いているときだけ木に居る）。 */
function confirmDialog(): Element | null {
  return document.querySelector("dialog.task-run-confirm")
}

describe("タスクの実行を頼む", () => {
  it("ターンが動いている間は「実行する」を出さず、理由を出す", () => {
    const sent: unknown[] = []
    renderList(collectInto(sent), RUNNING_TURN)

    startFromPeek("X-002")

    expect(screen.queryByRole("button", { name: "実行する" })).toBeNull()
    expect(confirmDialog()?.textContent).toContain("いまターンが動いているので送れない")
    expect(sent).toEqual([])
  })

  it.each([
    ["「キャンセル」", () => fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))],
    [
      "Esc（ブラウザが流す close）",
      () => {
        const dialog = confirmDialog()
        if (dialog === null) {
          throw new Error("確認が開いていない")
        }
        fireEvent(dialog, new Event("close"))
      },
    ],
  ])("区画の一覧の確認を %s で閉じると、何も送らず確認だけ閉じて、のぞき窓は残る", (_, dismiss) => {
    const sent: unknown[] = []
    renderList(collectInto(sent), {})

    startFromPeek("X-002")
    dismiss()

    expect(sent).toEqual([])
    expect(confirmDialog()).toBeNull()
    expect(document.querySelector('dialog[aria-label="X-002 の詳細"]')).not.toBeNull()
  })

  it("モーダルから断ったときは確認だけ閉じ、一覧へ戻れる", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    openRunConfirm("X-002")
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(closed).toEqual([])
    expect(confirmDialog()).toBeNull()
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })

  // 確認はモーダルの `<dialog>` の中に組み立てられるので、その backdrop のクリックがモーダルまで
  // 届くと一覧ごと消える（モーダルを閉じる判定は `event.target` がモーダル自身のときだけ）。
  it("確認を開いてもモーダルは開いたまま", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    openRunConfirm("X-002")
    const dialog = confirmDialog()
    if (dialog === null) {
      throw new Error("確認が開いていない")
    }
    fireEvent.click(dialog)

    expect(closed).toEqual([])
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })

  it("区画の一覧で「これを始める」が出るのは着手できる todo だけ", () => {
    const task = (
      id: string,
      status: string,
      dependencies: readonly string[],
    ): TaskSummaryItem => ({
      id,
      summary: `架空のタスク ${id}`,
      status,
      dependencies,
      waitingFor: dependencies,
      labels: [],
      body: "",
      location: { kind: "none" },
    })
    putSession(INITIAL_SESSION_STATE, () => {})
    render(
      <TaskList
        tasks={known([
          task("Y-001", "doing", []),
          task("Y-002", "todo", ["Y-001"]),
          task("Y-003", "todo", []),
          task("Y-004", "hold", []),
        ])}
        selectedStatus="all"
      />,
    )

    const startable = ["Y-001", "Y-002", "Y-003", "Y-004"].filter((id) => {
      fireEvent.click(rowOf(id))
      return screen.queryByRole("button", { name: "これを始める →" }) !== null
    })
    expect(startable).toEqual(["Y-003"])
  })

  it("モーダルからは依存の済んだ保留も頼め、判断を聞かれることを確認に添える", () => {
    const sent: unknown[] = []
    renderBoard(
      collectInto(sent),
      [],
      [...TASKS, holdTask("X-003", ["X-001"], [])],
      DEFAULT_RUN_PROMPT,
    )

    openRunConfirm("X-003")
    expect(confirmDialog()?.textContent).toContain("着手の前に判断を聞いて")
    fireEvent.click(screen.getByRole("button", { name: "実行する" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "タスク X-003 を進めて（bd show X-003 で読める）。このタスクは保留なので、着手の前に判断を聞いて。",
        images: [],
      },
    ])
  })

  it("設定の文面の {id} をタスクIDにして送る。既定でない文面では保留の説明を添えない", () => {
    const sent: unknown[] = []
    renderBoard(
      collectInto(sent),
      [],
      [...TASKS, holdTask("X-003", ["X-001"], [])],
      "/work {id} now",
    )

    openRunConfirm("X-003")
    expect(confirmDialog()?.textContent).toContain("/work X-003 now")
    expect(confirmDialog()?.textContent).not.toContain("判断を聞いて")
    fireEvent.click(screen.getByRole("button", { name: "実行する" }))

    expect(sent).toEqual([{ procedure: "session.prompt", text: "/work X-003 now", images: [] }])
  })

  it("送り先のコマンドが一覧に無いと、ボタンを押せず理由を出す（モーダル・区画の一覧）", () => {
    const commands: Partial<SessionState> = { slashCommands: ["clear", "next-task"] }
    renderBoard(() => {}, [], TASKS, "/work {id}", commands)

    fireEvent.click(screen.getByRole("option", { name: /X-002/ }))
    const run = screen.getByRole("button", { name: "tsukumo に頼む" })
    expect(run.getAttribute("aria-disabled")).toBe("true")
    expect(run.getAttribute("title")).toBe("/work が無いので頼めません")

    cleanup()
    putSession({ ...INITIAL_SESSION_STATE, ...commands }, () => {})
    render(<TaskList tasks={known(TASKS, "/work {id}")} selectedStatus="all" />)
    fireEvent.click(rowOf("X-002"))
    expect(screen.queryByRole("button", { name: "これを始める →" })).toBeNull()
  })

  it("送り先のコマンドが一覧に在る、または一覧がまだ届いていないときは押せる", () => {
    renderBoard(() => {}, [], TASKS, "/work {id}", { slashCommands: ["work"] })
    fireEvent.click(screen.getByRole("option", { name: /X-002/ }))
    expect(
      screen.getByRole("button", { name: "tsukumo に頼む" }).getAttribute("aria-disabled"),
    ).not.toBe("true")

    cleanup()
    renderBoard(() => {}, [], TASKS, "/work {id}")
    fireEvent.click(screen.getByRole("option", { name: /X-002/ }))
    expect(
      screen.getByRole("button", { name: "tsukumo に頼む" }).getAttribute("aria-disabled"),
    ).not.toBe("true")
  })

  it("モーダルでも待ちの残る保留は頼めない", () => {
    renderBoard(() => {}, [], [...TASKS, holdTask("X-003", ["X-002"], ["X-002"])])

    fireEvent.click(screen.getByRole("option", { name: /X-003/ }))

    const run = screen.getByRole("button", { name: "tsukumo に頼む" })
    expect(run.getAttribute("aria-disabled")).toBe("true")
    expect(run.getAttribute("title")).toBe("待ちが終わると頼めます")
  })
})

function holdTask(
  id: string,
  dependencies: readonly string[],
  waitingFor: readonly string[],
): TaskSummaryItem {
  return {
    id,
    summary: `架空の保留 ${id}`,
    status: "hold",
    dependencies,
    waitingFor,
    labels: [],
    body: "",
    location: { kind: "none" },
  }
}

/** 区画の一覧の行（カード）のボタン。 */
function rowOf(taskId: string): HTMLElement {
  const element = document.getElementById(`task-row-${taskId}`)
  if (element === null) {
    throw new Error(`${taskId} の行が無い`)
  }
  return element
}

/** 区画の一覧で `taskId` の行を押してのぞき窓を開き、「これを始める」を押す。 */
function startFromPeek(taskId: string): void {
  fireEvent.click(rowOf(taskId))
  fireEvent.click(screen.getByRole("button", { name: "これを始める →" }))
}

/** モーダルの一覧で `taskId` の行を選び、操作の帯の「tsukumo に頼む」を押す。 */
function openRunConfirm(taskId: string): void {
  fireEvent.click(screen.getByRole("option", { name: new RegExp(taskId) }))
  fireEvent.click(screen.getByRole("button", { name: "tsukumo に頼む" }))
}
