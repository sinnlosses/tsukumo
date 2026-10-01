import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAchievementCalendar } from "../../../../../../src/browser/components/page/achievement/hooks/use-achievement-calendar.ts"
import type { AchievementCalendar } from "../../../../../../src/shared/achievement/achievement-calendar.ts"
import { createTestQueryClient, queryClientWrapper } from "../../../../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../../rpc-fetch-stub.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function stubFetch(reply: () => RpcStubReply): void {
  fetchStub = stubRpcFetch(reply)
}

const KNOWN: AchievementCalendar = {
  kind: "known",
  today: "2026-09-24",
  days: [{ date: "2026-09-24", commitCount: 5 }],
  diaryDates: ["2026-09-24"],
}

describe("useAchievementCalendar", () => {
  it("届く前は loading", () => {
    stubFetch(() => rpcOutput(KNOWN))
    const { result } = renderHook(() => useAchievementCalendar(), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    expect(result.current.kind).toBe("loading")
  })

  it("届けばそのまま渡し、月曜はじまりの35日のマスと範囲の字を畳む", async () => {
    stubFetch(() => rpcOutput(KNOWN))
    const { result } = renderHook(() => useAchievementCalendar(), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.kind).toBe("known")
    })
    expect(result.current).toMatchObject(KNOWN)
    if (result.current.kind !== "known") {
      return
    }
    const { cells, rangeLabel } = result.current
    expect(cells).toHaveLength(35)
    expect(rangeLabel).toBe("8月24日〜9月27日")
    expect(cells[0]).toMatchObject({ kind: "day", dateLabel: "8/24", level: "none" })
    expect(cells[7]).toMatchObject({ kind: "day", dateLabel: "31", date: "2026-08-31" })
    expect(cells[8]).toMatchObject({ kind: "day", dateLabel: "9/1" })
    expect(cells[31]).toEqual({
      kind: "day",
      key: "2026-09-24",
      date: "2026-09-24",
      dateLabel: "24",
      level: "faint",
      hasDiary: true,
      isToday: true,
      ariaLabel: "9月24日 灯り ほのか・日記あり",
    })
    expect(cells[32]).toEqual({ kind: "future", key: "2026-09-25", dateLabel: "25" })
  })

  it("main が読めなければ unknown", async () => {
    stubFetch(() => rpcOutput({ kind: "unknown" }))
    const { result } = renderHook(() => useAchievementCalendar(), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.kind).toBe("unknown")
    })
  })

  it("取りに行って失敗したときも unknown（main が読めないときと同じ1行になる）", async () => {
    stubFetch(() => rpcError(503, "UNAVAILABLE"))
    const { result } = renderHook(() => useAchievementCalendar(), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.kind).toBe("unknown")
    })
  })
})
