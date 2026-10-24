import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useWelcomeCards } from "../../../../../../../src/browser/components/page/conversation/components/hooks/use-welcome-card-list.ts"
import type { SessionChoice } from "../../../../../../../src/shared/session/session-choice.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../../../dom-environment.ts"
import { queryClientWrapper } from "../../../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../../rpc-fetch-stub.ts"
import { putSession } from "../../../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  fetchStub?.restore()
  fetchStub = undefined
  setPageUrl("http://127.0.0.1/")
})

function session(sessionId: string, heading: string): SessionChoice {
  return {
    viewPort: 7327,
    sessionId,
    lastModified: 2000,
    startedAt: 1000,
    heading,
    worktree: "fictional-tree",
    inCurrentWorktree: true,
  }
}

describe("useWelcomeCards", () => {
  it("前回の続きの札を、前のセッションの要約ではなく残り（remaining）から作る", async () => {
    setPageUrl("http://127.0.0.1:7327/")
    fetchStub = stubRpcFetch(() =>
      rpcOutput({
        kind: "known",
        requestCount: 2,
        summary: "架空の要約。\n\n残り：架空の要約の中の残り。",
        remaining: "架空の欄の残り。",
        lastLine: "架空のセリフ",
      }),
    )
    putSession({
      ...INITIAL_SESSION_STATE,
      session: { kind: "identified", sessionId: "fa000000-0000" },
      sessions: [
        session("fa000000-0000", "架空のいまの作業"),
        session("7b000000-0000", "架空の題"),
      ],
    })

    const { result } = renderHook(useWelcomeCards, { wrapper: queryClientWrapper() })

    await waitFor(() => {
      expect(result.current.cards.map((card) => [card.id, card.title])).toEqual([
        ["架空の題", "架空の欄の残り。"],
      ])
    })
  })

  it("始め方の一覧の局面でない（依頼を送って働いている）あいだは前のセッションの要約を取りに行かない", async () => {
    setPageUrl("http://127.0.0.1:7327/")
    fetchStub = stubRpcFetch(() => rpcOutput({ kind: "unavailable" }))
    putSession({
      ...INITIAL_SESSION_STATE,
      session: { kind: "identified", sessionId: "fa000000-0000" },
      sessions: [
        session("fa000000-0000", "架空のいまの作業"),
        session("7b000000-0000", "架空の題"),
      ],
      turn: { kind: "running", startedAt: 0 },
    })

    renderHook(useWelcomeCards, { wrapper: queryClientWrapper() })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(fetchStub.calls()).toEqual([])
  })
})
