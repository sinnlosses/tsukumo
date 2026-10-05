import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/components/deferred-task-body.tsx"
import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"
import { putSession } from "../../session-store.ts"

// 本文中の ID の自動リンク（`docs/architecture/display.md`「タスクのモーダル」の
// 「本文中の ID の自動リンク」）。一覧に載っている ID の字面とだけ照らすので、
// 語の途中・まるごとでない inline code・フェンスの中・一覧に無い ID には付かないことを確かめる。
// フィクスチャはすべて手で書いた架空のタスク。

let fetchStub: RpcFetchStub | undefined = undefined

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

// タスク番号の形（`T-` + 3桁・`GH-<n>`）はコード中に書くと検査に落ちるので、フィクスチャの
// ID には別の形（Beads 方式の課題番号と同じ `X-nnn`）を使う。
const BODY = [
  "地の文の X-202 は押せる。X-2021 は語の途中なので押せない。X-909 は一覧に無いので押せない。",
  "",
  "中身がまるごと `X-202` の inline code は押せる。`X-2025` はまるごとでないので押せない。",
  "",
  "```",
  "X-202",
  "```",
].join("\n")

function task(id: string, body: string): TaskSummaryItem {
  return {
    id,
    summary: `架空のタスク（${id}）`,
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    assignee: undefined,
    body,
    location: { kind: "file", path: `develop/task/${id}.md` },
  }
}

function renderBoard(): void {
  putSession(INITIAL_SESSION_STATE)
  fetchStub = stubRpcFetch(() => rpcOutput([]))
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TaskBoard
        tasks={{
          kind: "known",
          runPrompt: "/next-task {id}",
          items: [task("X-201", BODY), task("X-202", "## 目的\n\n架空。\n")],
        }}
        request={{ kind: "open", focus: { kind: "first" } }}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe("本文中の ID の自動リンク", () => {
  it("一覧に載っている ID の地の文・まるごとの inline code だけを押せる字にする", () => {
    renderBoard()

    const body = screen.getByRole("article", { name: "本文" })
    const links = within(body).getAllByRole("link", { name: "X-202" })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("task:X-202")
    }
    expect(within(body).queryByRole("link", { name: "X-2021" })).toBeNull()
    expect(within(body).queryByRole("link", { name: "X-909" })).toBeNull()
    expect(within(body).queryByRole("link", { name: "X-2025" })).toBeNull()
  })
})
