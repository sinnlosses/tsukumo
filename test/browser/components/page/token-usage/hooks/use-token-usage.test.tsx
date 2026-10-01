import type { QueryClient } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { useTokenUsage } from "../../../../../../src/browser/components/page/token-usage/hooks/use-token-usage.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { DEFAULT_TOKEN_USAGE_DAYS } from "../../../../../../src/shared/token-usage/token-usage-summary.ts"
import { createTestQueryClient, queryClientWrapper } from "../../../../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../../rpc-fetch-stub.ts"
import { putSession } from "../../../../session-store.ts"

/**
 * 画面（`TokenUsage`）を丸ごと描かずに、期間の選択と取得の畳み方だけを測る
 * （docs/architecture.md「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の集計
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function stubTokenUsageFetch(reply: () => RpcStubReply): void {
  fetchStub = stubRpcFetch(reply)
}

/** `tokenUsage.summary` を、この日数で呼んだか。 */
function askedDays(days: number): boolean {
  return (fetchStub?.calls() ?? []).some(
    (call) =>
      call.procedure === "tokenUsage/summary" &&
      JSON.stringify(call.input) === JSON.stringify({ days }),
  )
}

/** `useQuery` が要る `QueryClientProvider`。client は呼び出し側で1回だけ作る（再レンダーの
 * たびに作り直すとキャッシュが毎回リセットされ、選び直した日数の取り直しが測れない）。
 * `useTokenUsage` は `plan` も姿から読むので、姿も一緒に入れる
 * （既定は `INITIAL_SESSION_STATE` そのまま。`plan` を変えたいテストは `state` を渡す）。 */
function tokenUsageWrapper(
  client: QueryClient,
  state: SessionState = INITIAL_SESSION_STATE,
): (props: { children: ReactNode }) => ReactElement {
  putSession(state)
  return queryClientWrapper(client)
}

const FIXTURE_TOTALS = {
  inputTokens: 100,
  outputTokens: 200,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0.5,
}

const FIXTURE_SUMMARY = {
  trend: { unit: "day", points: [{ key: "2001-02-03", totals: FIXTURE_TOTALS }] },
  byModel: [{ model: "架空モデル", totals: FIXTURE_TOTALS }],
  byTool: [],
}

/** 結果の大きい順に9件（上から6件が初めに出る）。 */
const SUMMARY_WITH_TOOLS = {
  ...FIXTURE_SUMMARY,
  byTool: Array.from({ length: 9 }, (_, index) => ({
    name: `ツール${index}`,
    calls: 1,
    resultBytes: 9 - index,
  })),
}

function readyReport(
  result: ReturnType<typeof useTokenUsage>,
): Extract<ReturnType<typeof useTokenUsage>["report"], { kind: "ready" }> {
  if (result.report.kind !== "ready") {
    throw new Error(`ready のはずが ${result.report.kind}`)
  }
  return result.report
}

function toggleTools(result: ReturnType<typeof useTokenUsage>): void {
  const { more } = readyReport(result).tools
  if (more.kind !== "some") {
    throw new Error("開閉の口が無い")
  }
  more.onToggle()
}

describe("useTokenUsage", () => {
  it("初期の期間は既定の日数", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })

    expect(result.current.days).toBe(DEFAULT_TOKEN_USAGE_DAYS)
    // 取得は非同期に終わる。確定するまで待ってからテストを終える（待たずに終えると、
    // 次のテストの実行中に応答が届いて act の外で state が更新される）。
    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
  })

  it("onDaysChange で選ぶと日数が変わり、その日数で取り直す", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(askedDays(DEFAULT_TOKEN_USAGE_DAYS)).toBe(true)
    })

    act(() => {
      result.current.onDaysChange(30)
    })

    expect(result.current.days).toBe(30)
    await waitFor(() => {
      expect(askedDays(30)).toBe(true)
    })
  })

  it("取れたら合計込みの札の値を返し、failed にはならない", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
    const report = readyReport(result.current)
    expect(report.trend.points).toHaveLength(1)
    expect(report.periodCards.map((card) => [card.label, card.value])).toEqual([
      ["入力", "100"],
      ["出力", "200"],
      ["キャッシュ読み", "0"],
      ["キャッシュ作成", "0"],
    ])
  })

  it("応答が落ちたら failed になる", async () => {
    stubTokenUsageFetch(() => rpcError(500))

    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.report.kind).toBe("failed")
    })
  })

  it("期間の札は今日・7日・30日で、選んでいるものだけが pressed", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })

    expect(result.current.periodChoices.map((c) => [c.days, c.label, c.pressed])).toEqual([
      [1, "今日", false],
      [7, "7日", true],
      [30, "30日", false],
    ])
  })

  it("モデル別は届いた順のまま、出力の列の最大に対する割合を添える（最大が0なら0%）", async () => {
    const low = { ...FIXTURE_TOTALS, outputTokens: 50 }
    stubTokenUsageFetch(() =>
      rpcOutput({
        ...FIXTURE_SUMMARY,
        byModel: [
          { model: "少ない", totals: low },
          { model: "多い", totals: FIXTURE_TOTALS },
        ],
      }),
    )
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
    expect(
      readyReport(result.current).models.map((row) => [row.model, row.output, row.outputShare]),
    ).toEqual([
      ["少ない", "50", "25%"],
      ["多い", "200", "100%"],
    ])
  })

  it("ツール別は上から6件だけを出し、残りは「ほか n 件を見る」で開いて「閉じる」で戻す", async () => {
    stubTokenUsageFetch(() => rpcOutput(SUMMARY_WITH_TOOLS))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })

    const folded = readyReport(result.current).tools
    expect(folded.rows).toHaveLength(6)
    expect(folded.rows[0]).toEqual({ name: "ツール0", calls: 1, size: "9 B", share: "100%" })
    expect(folded.more).toMatchObject({ kind: "some", label: "ほか 3 件を見る" })

    act(() => {
      toggleTools(result.current)
    })

    const expanded = readyReport(result.current).tools
    expect(expanded.rows).toHaveLength(9)
    expect(expanded.more).toMatchObject({ kind: "some", label: "閉じる" })

    act(() => {
      toggleTools(result.current)
    })

    expect(readyReport(result.current).tools.rows).toHaveLength(6)
  })

  it("ツール別が6件ちょうどなら開閉の口は無い", async () => {
    stubTokenUsageFetch(() =>
      rpcOutput({ ...SUMMARY_WITH_TOOLS, byTool: SUMMARY_WITH_TOOLS.byTool.slice(0, 6) }),
    )
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
    expect(readyReport(result.current).tools.more).toEqual({ kind: "none" })
  })

  it("ツール別を開いてから期間を切り替えると畳まれる", async () => {
    stubTokenUsageFetch(() => rpcOutput(SUMMARY_WITH_TOOLS))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient()),
    })
    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
    act(() => {
      toggleTools(result.current)
    })
    expect(readyReport(result.current).tools.rows).toHaveLength(9)

    act(() => {
      result.current.onDaysChange(30)
    })

    await waitFor(() => {
      expect(askedDays(30)).toBe(true)
    })
    await waitFor(() => {
      expect(result.current.report.kind).toBe("ready")
    })
    expect(readyReport(result.current).tools.rows).toHaveLength(6)

    // 取得済みの期間へ戻るときは、取り直しを待たずに札が描かれ続ける。そこでも畳まれる。
    act(() => {
      toggleTools(result.current)
    })
    expect(readyReport(result.current).tools.rows).toHaveLength(9)
    act(() => {
      result.current.onDaysChange(DEFAULT_TOKEN_USAGE_DAYS)
    })
    expect(readyReport(result.current).tools.rows).toHaveLength(6)
  })

  it("plan は state.plan をそのまま返す", async () => {
    stubTokenUsageFetch(() => rpcOutput(FIXTURE_SUMMARY))
    const { result } = renderHook(() => useTokenUsage(), {
      wrapper: tokenUsageWrapper(createTestQueryClient(), {
        ...INITIAL_SESSION_STATE,
        plan: "max",
      }),
    })

    expect(result.current.plan).toBe("max")
  })
})
