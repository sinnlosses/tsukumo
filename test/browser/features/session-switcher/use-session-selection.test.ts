import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { SessionSwitcherRow } from "../../../../src/browser/features/session-switcher/session-switcher-row.ts"
import { useSessionSelection } from "../../../../src/browser/features/session-switcher/use-session-selection.ts"
import { checkedSessionId } from "../../../fixture/session-id.ts"
import { queryClientWrapper } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"

let fetchStub: RpcFetchStub | undefined = undefined

beforeEach(() => {
  fetchStub = stubRpcFetch(() => rpcOutput({ kind: "known", requestCount: 1 }))
})

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function row(sessionId: string, patch: Partial<SessionSwitcherRow> = {}): SessionSwitcherRow {
  return {
    sessionId: checkedSessionId(sessionId),
    shortId: sessionId.slice(0, 2).toUpperCase(),
    heading: "架空の作業",
    group: "today",
    timeLabel: "10:00",
    rangeLabel: "9/26 09:00 – 10:00",
    current: false,
    worktree: "fictional-tree",
    inCurrentWorktree: true,
    occupiedElsewhere: false,
    ...patch,
  }
}

const NOW = row("fa000000-0000", { current: true })
const BUSY = row("7b000000-0000", { occupiedElsewhere: true })
const OTHER = row("c3000000-0000")
const LAST = row("d4000000-0000")

describe("useSessionSelection", () => {
  it("使用中の行は選べない", () => {
    const { result } = renderHook(() => useSessionSelection([NOW, BUSY, OTHER], OTHER.sessionId), {
      wrapper: queryClientWrapper(),
    })

    act(() => {
      result.current.select(BUSY.sessionId)
    })

    expect(result.current.selected?.sessionId).toBe(OTHER.sessionId)
  })

  it("move は使用中の行を飛ばす", () => {
    const { result } = renderHook(
      () => useSessionSelection([NOW, OTHER, BUSY, LAST], OTHER.sessionId),
      { wrapper: queryClientWrapper() },
    )

    act(() => {
      result.current.move(1)
    })

    expect(result.current.selected?.sessionId).toBe(LAST.sessionId)
  })

  it("選んでいた行が後から使用中になったら、いまの行でなく別の行へ落ちる", () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useSessionSelection(rows, OTHER.sessionId),
      { initialProps: { rows: [NOW, OTHER, LAST] }, wrapper: queryClientWrapper() },
    )
    expect(result.current.selected?.sessionId).toBe(OTHER.sessionId)

    rerender({ rows: [NOW, { ...OTHER, occupiedElsewhere: true }, LAST] })

    expect(result.current.selected?.sessionId).toBe(LAST.sessionId)
  })
})
