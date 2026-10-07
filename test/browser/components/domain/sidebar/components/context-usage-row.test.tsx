import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { ContextUsageRow } from "../../../../../../src/browser/components/domain/sidebar/components/context-usage-row.tsx"
import { useContextUsage } from "../../../../../../src/browser/domain/context-usage.ts"
import { rpc } from "../../../../../../src/browser/domain/rpc.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../../../src/shared/context-usage/context-usage.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { readyContextUsage } from "../../../../../fixture/context-usage.ts"
import { createTestQueryClient } from "../../../../query-client.tsx"
import { stubRpcFetch } from "../../../../rpc-fetch-stub.ts"
import { putSession } from "../../../../session-store.ts"

/**
 * サイドバー「セッション情報」の使用量の行。出す数は札
 * （成果の使用量の札）と同じ出どころ
 * （`usage.totalTokens` / `usage.maxTokens` / `usage.percentage`）なので、ここでは70%以上の
 * 警告・届く前・取れないときの高さだけを測る。
 *
 * `fetch` は使わず `QueryClient` に直接 `setQueryData` する（`renderRow` の既定の状態
 * — `state.finishedTurnCount` が 0 — なら `refetchKey` は必ず 0 になる）。取得そのものは別のテストが
 * 測るので、ここで `fetch` を経由すると非同期の隙間が増えるだけで測るものが増えない
 * ——テストのたびに残る未解決の Promise が、次のテストの act 外の更新として警告を出す
 * 原因にもなっていた。
 */

afterEach(() => {
  cleanup()
})

const REFETCH_KEY = 0

function renderRow(report: ContextUsageReport | undefined): void {
  putSession(INITIAL_SESSION_STATE)
  const client = createTestQueryClient()
  if (report !== undefined) {
    // 鍵は手続きの鍵に取り直しの合図（`state.finishedTurnCount`）を足したもの。
    client.setQueryData([...rpc.contextUsage.report.queryKey(), REFETCH_KEY], report)
  }
  render(
    <QueryClientProvider client={client}>
      <ContextUsageRowFromQuery />
    </QueryClientProvider>,
  )
}

/** 札が受け取る値は `SidebarFooter` が取る。ここでは同じ取り方で1枚だけ描く。 */
function ContextUsageRowFromQuery(): ReactElement {
  return <ContextUsageRow usage={useContextUsage(REFETCH_KEY)} />
}

describe("ContextUsageRow", () => {
  it("70%未満は警告にしない", () => {
    renderRow(readyContextUsage({ percentage: 69 }))

    expect(screen.queryByText("そろそろ区切りどき。自動圧縮まで あと 95.0k")).toBeNull()
    expect(screen.queryByText("自動圧縮まで あと 95.0k")).not.toBeNull()
  })

  it("70%以上は割合・棒を警告にし、3段目に「そろそろ区切りどき」を添える", () => {
    renderRow(readyContextUsage({ percentage: 70 }))

    expect(screen.queryByText("70%")).not.toBeNull()
    expect(screen.queryByText("そろそろ区切りどき。自動圧縮まで あと 95.0k")).not.toBeNull()
  })

  it("届く前は一言を出し、行の高さを揺らす骨組みは持たない", () => {
    // 「まだ届いていない」を測るための1回だけ、`fetch` を差し替える。戻ってこない
    // Promiseにする——中途半端に解決する Promise を残すと、後片付けのタイミング次第で
    // 次のテストの act 外の更新として警告が出るため（`setQueryData` を使わない唯一の理由）。
    const fetchStub = stubRpcFetch(() => ({ kind: "pending" }))
    try {
      renderRow(undefined)

      expect(screen.queryByText("取得中…")).not.toBeNull()
      expect(screen.queryByText("—")).not.toBeNull()
      const link = document.querySelector("a[href='#token-usage']")
      expect(link?.getAttribute("aria-label")).toBe(
        "コンテキスト 取得中。トークン消費の画面で詳しく見る",
      )
    } finally {
      fetchStub.restore()
    }
  })

  it("取れなかったときも同じ行のまま、一言だけ変わる", () => {
    renderRow(UNAVAILABLE_CONTEXT_USAGE)

    expect(screen.queryByText("いまのコンテキストは取れていない")).not.toBeNull()
    // 取れなくても押す先は変わらない。
    const link = document.querySelector("a[href='#token-usage']")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("aria-label")).toBe(
      "コンテキストは取れていない。トークン消費の画面で詳しく見る",
    )
  })
})
