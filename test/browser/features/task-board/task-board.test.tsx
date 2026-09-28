import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"
import { putSession } from "../../session-store.ts"

// タスクのモーダルのうち、Beads 方式の置き場所（Issue）と置き場所の無い課題。
// E2E の足場は一時の cwd に develop/task/ を手書きするファイル方式しか作れない（`bd` を起こさない）ので、ここで持つ。
// フィクスチャはすべて手で書いた架空の課題。

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

const ISSUE_URL = "https://example.invalid/foo/bar/issues/12"

function beadsTask(location: TaskSummaryItem["location"]): TaskSummaryItem {
  return {
    id: "X-012",
    summary: "架空の課題",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body: "## 目的・背景\n\n架空の本文。\n",
    location,
  }
}

function renderBoard(task: TaskSummaryItem): void {
  putSession(INITIAL_SESSION_STATE)
  fetchStub = stubRpcFetch(() => rpcOutput([]))
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TaskBoard tasks={{ kind: "known", items: [task] }} open={true} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe("タスクのモーダルの置き場所（Beads 方式）", () => {
  it("external_ref の URL を情報の表の Issue の行に出し、操作の帯の「Issue を開く」で新しいタブに開く", () => {
    renderBoard(beadsTask({ kind: "issue", url: ISSUE_URL }))

    expect(screen.getByText("Issue", { selector: "dt" })).toBeDefined()
    expect(screen.getByRole("link", { name: ISSUE_URL }).getAttribute("href")).toBe(ISSUE_URL)
    const open = screen.getByRole("link", { name: "Issue を開く" })
    expect(open.getAttribute("href")).toBe(ISSUE_URL)
    expect(open.getAttribute("target")).toBe("_blank")
    expect(screen.queryByText("ファイル")).toBeNull()
    expect(screen.queryByRole("button", { name: "エディタで開く" })).toBeNull()
  })

  it("置き場所の無い課題は、置き場所の行も開く口も出さない", () => {
    renderBoard(beadsTask({ kind: "none" }))

    expect(screen.queryByText("Issue")).toBeNull()
    expect(screen.queryByText("ファイル")).toBeNull()
    expect(screen.queryByRole("link", { name: "Issue を開く" })).toBeNull()
    expect(screen.queryByRole("button", { name: "エディタで開く" })).toBeNull()
  })
})
