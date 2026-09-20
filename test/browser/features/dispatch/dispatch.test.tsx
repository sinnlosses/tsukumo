import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"

import { Dispatch } from "../../../../src/browser/features/dispatch/dispatch.tsx"
import {
  SessionContext,
  type SessionContextValue,
} from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"

afterEach(() => {
  cleanup()
  document.title = "tsukumo"
})

function renderDispatch(stateOverrides: Partial<SessionState>): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, ...stateOverrides },
    connection: "open",
    dispatch: () => {},
  }
  // 中の `<Composer>` が `@` 補完の一覧を `useQuery` で取るので Provider が要る
  // （この検査では取りに行かないが、hook そのものは呼ばれる）。
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={value}>
        <Dispatch />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

describe("Dispatch", () => {
  it("答え待ちが無いときはタブのタイトルをそのまま保つ", () => {
    document.title = "tsukumo"
    renderDispatch({ pending: [] })

    expect(document.title).toBe("tsukumo")
  })

  it("答え待ちがあるとタブのタイトルの先頭に「● 」を付け、枠を強調する印を出す", () => {
    document.title = "tsukumo"
    renderDispatch({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    expect(document.title).toBe("● tsukumo")
    expect(document.querySelector(".dispatch-pending-glow")).not.toBeNull()
  })

  it("入力欄（Composer）と答え待ちの箱（PendingAnswer）を両方描く", () => {
    renderDispatch({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    expect(screen.getByText("許可")).toBeDefined()
    expect(screen.getByPlaceholderText(/依頼を書く/)).toBeDefined()
  })
})
