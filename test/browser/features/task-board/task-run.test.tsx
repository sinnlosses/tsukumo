import { QueryClientProvider } from "@tanstack/react-query"
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
import { createTestQueryClient } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"
import { type CommandSpy, putSession } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
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

/**
 * 見出しの「一覧を見る」で開くタスクのモーダル（開いた状態で描く）。閉じる要求は `closed` に溜まる。
 * 「エディタで開く」が引くファイル一覧の手続きは空の一覧を返す代役にする。
 */
function renderBoard(spy: CommandSpy = () => {}, closed: string[] = []): void {
  fetchStub = stubRpcFetch(() => rpcOutput([]))
  renderWithStore(
    <QueryClientProvider client={createTestQueryClient()}>
      <TaskBoard
        tasks={known(TASKS)}
        open={true}
        onClose={() => {
          closed.push("モーダル")
        }}
      />
    </QueryClientProvider>,
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
})

/** モーダルの一覧で `taskId` の行を選び、操作の帯の「tsukumo に頼む」を押す。 */
function openRunConfirm(taskId: string): void {
  fireEvent.click(screen.getByRole("option", { name: new RegExp(taskId) }))
  fireEvent.click(screen.getByRole("button", { name: "tsukumo に頼む" }))
}
