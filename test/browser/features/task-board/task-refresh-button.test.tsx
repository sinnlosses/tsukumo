import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskRefreshButton } from "../../../../src/browser/features/task-board/components/task-refresh-button.tsx"
import { queryClientWrapper } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"

let stub: RpcFetchStub | undefined

afterEach(() => {
  cleanup()
  stub?.restore()
  stub = undefined
})

function renderTwo(): void {
  render(
    <>
      <TaskRefreshButton place="sidebar" />
      <TaskRefreshButton place="modal" />
    </>,
    { wrapper: queryClientWrapper() },
  )
}

/** 押せない状態は `aria-disabled` で出る。 */
function busyStates(): readonly boolean[] {
  return screen
    .getAllByRole("button", { name: "最新化" })
    .map((button) => button.getAttribute("aria-disabled") === "true")
}

describe("タスク一覧の最新化ボタン", () => {
  it("押すと repository.refreshTasks が1回送られ、応答のあとまた押せる", async () => {
    const sent = stubRpcFetch(() => rpcOutput(undefined))
    stub = sent
    renderTwo()

    fireEvent.click(screen.getAllByRole("button", { name: "最新化" })[0] ?? document.body)

    await waitFor(() => {
      expect(sent.calls().map((call) => call.procedure)).toStrictEqual(["repository/refreshTasks"])
    })
    await waitFor(() => {
      expect(busyStates()).toStrictEqual([false, false])
    })
  })

  it("応答が返らないあいだは、どちらのボタンも押せず、押し直しても送られない", async () => {
    const sent = stubRpcFetch(() => ({ kind: "pending" }))
    stub = sent
    renderTwo()
    const buttons = screen.getAllByRole<HTMLButtonElement>("button", { name: "最新化" })

    fireEvent.click(buttons[0] ?? document.body)
    await waitFor(() => {
      expect(busyStates()).toStrictEqual([true, true])
    })
    fireEvent.click(buttons[1] ?? document.body)

    expect(sent.calls()).toHaveLength(1)
  })
})
