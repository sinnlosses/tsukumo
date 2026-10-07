import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SidebarFooter } from "../../../../../../src/browser/components/domain/sidebar/components/sidebar-footer.tsx"
import { readyContextUsage } from "../../../../../fixture/context-usage.ts"
import { readyPlanUsage } from "../../../../../fixture/plan-usage.ts"
import { createTestQueryClient } from "../../../../query-client.tsx"
import {
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../../rpc-fetch-stub.ts"
import { putSession, putState, stateWith } from "../../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

const ATTRIBUTE = "data-finished-turn-count"

describe("SidebarFooter", () => {
  it("目盛りの口は、出している値を取ったときの終わったターンの数を出す。取り直しの間、コンテキストは出さず、利用枠は前の数のまま", async () => {
    const replies = { answering: true }
    fetchStub = stubRpcFetch((call): RpcStubReply => {
      if (!replies.answering) {
        return { kind: "pending" }
      }
      if (call.procedure === "contextUsage/report") {
        return rpcOutput(readyContextUsage())
      }
      if (call.procedure === "planUsage/report") {
        return rpcOutput(readyPlanUsage())
      }
      return { kind: "pending" }
    })
    putSession(stateWith({ finishedTurnCount: 0 }))
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SidebarFooter />
      </QueryClientProvider>,
    )
    const context = screen.getByTitle("コンテキスト")
    const plan = screen.getByTitle("利用枠")

    await waitFor(() => {
      expect(context.getAttribute(ATTRIBUTE)).toBe("0")
      expect(plan.getAttribute(ATTRIBUTE)).toBe("0")
    })

    replies.answering = false
    act(() => {
      putState(stateWith({ finishedTurnCount: 1 }))
    })
    expect(context.getAttribute("aria-busy")).toBe("true")
    expect(context.hasAttribute(ATTRIBUTE)).toBe(false)
    expect(plan.getAttribute("aria-busy")).toBe("true")
    expect(plan.getAttribute(ATTRIBUTE)).toBe("0")

    replies.answering = true
    act(() => {
      putState(stateWith({ finishedTurnCount: 2 }))
    })
    await waitFor(() => {
      expect(context.getAttribute(ATTRIBUTE)).toBe("2")
      expect(plan.getAttribute(ATTRIBUTE)).toBe("2")
    })
    expect(context.hasAttribute("aria-busy")).toBe(false)
    expect(plan.hasAttribute("aria-busy")).toBe(false)
  })
})
