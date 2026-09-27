import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import { TaskList } from "../../../../src/browser/features/task-board/task-list.tsx"
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

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return { kind: "known", items }
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空の済んだタスク",
    status: "done",
    difficulty: "haiku",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-002",
    summary: "架空の未着手タスク",
    status: "todo",
    difficulty: "opus",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  },
]

const RUNNING_TURN: Partial<SessionState> = { turn: { kind: "running", startedAt: 0 } }

/** サイドバーの区画の一覧。確認は姿と送り口が要るので store で包む。 */
function renderList(spy: CommandSpy = () => {}, overrides: Partial<SessionState> = {}): void {
  renderWithStore(<TaskList tasks={known(TASKS)} selectedStatus={undefined} />, spy, overrides)
}

/** 見出しの「一覧を見る」で開く表（開いた状態で描く）。閉じる要求は `closed` に溜まる。 */
function renderBoard(spy: CommandSpy = () => {}, closed: string[] = []): void {
  renderWithStore(
    <TaskBoard
      tasks={known(TASKS)}
      open={true}
      onClose={() => {
        closed.push("表")
      }}
    />,
    spy,
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

describe("タスクIDから実行を頼む", () => {
  it("ターンが動いている間は「実行する」を出さず、理由を出す", () => {
    const sent: unknown[] = []
    renderList(collectInto(sent), RUNNING_TURN)

    fireEvent.click(screen.getByRole("button", { name: "X-002" }))

    expect(screen.queryByRole("button", { name: "実行する" })).toBeNull()
    expect(confirmDialog()?.textContent).toContain("いまターンが動いているので送れない")
    expect(sent).toEqual([])
  })

  it("表のIDからも同じ確認を開いて送れる", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent))

    fireEvent.click(screen.getByRole("button", { name: "X-002" }))
    fireEvent.click(screen.getByRole("button", { name: "実行する" }))

    expect(sent).toEqual([{ procedure: "session.prompt", text: "/next-task X-002", images: [] }])
  })

  // 送ったあとに表が残っていると、メインビューに並んだ依頼が画面いっぱいの表に隠れる。
  it("表から送ったときは、確認と表の両方が閉じる", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    fireEvent.click(screen.getByRole("button", { name: "X-002" }))
    fireEvent.click(screen.getByRole("button", { name: "実行する" }))

    expect(closed).toEqual(["表"])
    expect(confirmDialog()).toBeNull()
  })

  it("表から断ったときは確認だけ閉じ、一覧へ戻れる", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    fireEvent.click(screen.getByRole("button", { name: "X-002" }))
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(closed).toEqual([])
    expect(confirmDialog()).toBeNull()
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })

  // 確認は表の `<dialog>` の中に組み立てられるので、その backdrop のクリックが表まで
  // 届くと一覧ごと消える（表を閉じる判定は `event.target` が表自身のときだけ）。
  it("確認を開いても表は開いたまま", () => {
    const closed: string[] = []
    putSession(INITIAL_SESSION_STATE)
    render(
      <TaskBoard
        tasks={known(TASKS)}
        open={true}
        onClose={() => {
          closed.push("表")
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "X-002" }))
    const dialog = confirmDialog()
    if (dialog === null) {
      throw new Error("確認が開いていない")
    }
    fireEvent.click(dialog)

    expect(closed).toEqual([])
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })
})
