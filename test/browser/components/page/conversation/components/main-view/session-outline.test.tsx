// 左の札のセッション側（`docs/architecture/display/main-view.md`「やり取りの列」）。
// 行の材料は切り替え画面と同じなので、ここで見るのは札の中の出し方（いまの行・使用中・選んだ印・末尾の口）。

import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReportOutline } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-outline.tsx"
import { useOutlineSide } from "../../../../../../../src/browser/components/page/conversation/stores/outline-side.ts"
import { useSessionSwitcherRequest } from "../../../../../../../src/browser/stores/session-switcher-request.ts"
import type { SessionChoice } from "../../../../../../../src/shared/session/session-choice.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../../../dom-setup.ts"
import { checkedSessionId } from "../../../../../../fixture/session-id.ts"
import { detailRecord, requestRecord } from "../../../../../../fixture/session-record.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../../rpc-fetch-stub.ts"
import { putSession } from "../../../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
  setPageUrl("http://127.0.0.1/")
  useOutlineSide.setState({ side: "turns", shownAt: undefined })
  useSessionSwitcherRequest.setState(useSessionSwitcherRequest.getInitialState(), true)
  localStorage.clear()
})

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

function listed(sessionId: string, heading: string, ageMs: number, worktree = true): SessionChoice {
  const lastModified = Temporal.Now.instant().epochMilliseconds - ageMs
  return {
    viewPort: 7327,
    sessionId: checkedSessionId(sessionId),
    lastModified,
    startedAt: lastModified - HOUR_MS,
    heading,
    worktree: "fictional-tree",
    inCurrentWorktree: worktree,
  }
}

const OCCUPIED_ID = "c3000000-0000"

function renderOutline(): void {
  setPageUrl("http://127.0.0.1:7327/")
  fetchStub = stubRpcFetch((call) =>
    call.procedure === "sessionClaim/occupied" ? rpcOutput([OCCUPIED_ID]) : rpcOutput(undefined),
  )
  putSession({
    ...INITIAL_SESSION_STATE,
    session: { kind: "identified", sessionId: checkedSessionId("fa000000-0000") },
    sessions: [
      listed("7b000000-0000", "架空の昨日の作業", DAY_MS),
      listed(OCCUPIED_ID, "架空の使用中の作業", 2 * HOUR_MS),
      listed("d4000000-0000", "架空の古い作業", 5 * DAY_MS),
      listed("e5000000-0000", "架空の別の作業ツリー", HOUR_MS, false),
    ],
    records: [requestRecord({ text: "架空のいまの依頼", turnId: 0 }), detailRecord("本文")],
  })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ReportOutline />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole("tab", { name: /セッション/ }))
}

describe("左の札のセッション側", () => {
  it("一覧に無いいまのセッションを今日の先頭に「いま」で出し、この作業ツリーの昨日までだけを並べる", async () => {
    renderOutline()

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "昨日" })).toBeTruthy()
    })
    const today = screen.getByRole("group", { name: "今日" })
    expect(
      within(today)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(["架空のいまの依頼いま", expect.stringMatching(/^架空の使用中の作業\d/u)])
    expect(screen.queryByText("架空の古い作業")).toBeNull()
    expect(screen.queryByText("架空の別の作業ツリー")).toBeNull()
  })

  it("使用中の行は押せず、ほかの行を押すと選んだ印だけが付く", async () => {
    renderOutline()
    const occupied = await screen.findByRole("button", { name: /架空の使用中の作業/ })
    const free = screen.getByRole("button", { name: /架空の昨日の作業/ })
    await waitFor(() => {
      expect(occupied.getAttribute("aria-disabled")).toBe("true")
    })

    fireEvent.click(occupied)
    expect(occupied.getAttribute("data-selected")).toBe("false")
    fireEvent.click(free)
    expect(free.getAttribute("data-selected")).toBe("true")
  })

  it("末尾の口を押すと切り替え画面を開く", () => {
    renderOutline()

    fireEvent.click(screen.getByRole("button", { name: /ほかの作業ツリー・探す/ }))

    expect(useSessionSwitcherRequest.getState().open).toBe(true)
  })
})
