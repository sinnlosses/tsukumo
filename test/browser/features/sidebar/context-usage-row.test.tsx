import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"

import { ContextUsageRow } from "../../../../src/browser/features/sidebar/context-usage-row.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../src/shared/context-usage.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"
import { sessionStoreWith } from "../../session-store.ts"

/**
 * サイドバー「セッション情報」の使用量の行。**出す数は札
 * （`test/browser/features/token-usage/context-usage-card.test.tsx`）と同じ出どころ**
 * （`usage.totalTokens` / `usage.maxTokens` / `usage.percentage`）なので、ここでは行として
 * 描いたときの文字・押した先（右端の `›` だけ）・70%以上の警告・取れないときの高さだけを測る。
 *
 * **`fetch` は使わず `QueryClient` に直接 `setQueryData` する**（`renderRow` の既定の状態
 * — `state.turn` が `idle` — なら `refetchKey` は必ず 0 になる。`browser/domain/context-usage.ts`
 * の `contextUsageRefetchKey`）。取得そのものは `test/browser/domain/context-usage.test.tsx` が
 * 測るので、ここで `fetch` を経由すると非同期の隙間が増えるだけで測るものが増えない
 * ——テストのたびに残る未解決の Promise が、次のテストの act 外の更新として警告を出す
 * 原因にもなっていた。
 */

afterEach(() => {
  cleanup()
})

const REFETCH_KEY = 0

function renderRow(report: ContextUsageReport | undefined): void {
  const store = sessionStoreWith(INITIAL_SESSION_STATE)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (report !== undefined) {
    client.setQueryData(["context-usage", REFETCH_KEY], report)
  }
  render(
    <SessionStoreContext.Provider value={store}>
      <QueryClientProvider client={client}>
        <ContextUsageRow />
      </QueryClientProvider>
    </SessionStoreContext.Provider>,
  )
}

describe("ContextUsageRow", () => {
  it("届いたら割合と「使っている量 / 窓の大きさ」を出す（札の合計と同じ数）", () => {
    renderRow(readyContextUsage())

    // 架空の内訳は totalTokens 60,000 / maxTokens 200,000・percentage 30
    // （test/fixture/context-usage.ts）。
    expect(screen.queryByText("30%")).not.toBeNull()
    expect(screen.queryByText("60.0k / 200k")).not.toBeNull()
  })

  it("リンクは右端の `›` だけ——ラベル・割合・量・棒はリンクの外にある", () => {
    renderRow(readyContextUsage())

    const links = document.querySelectorAll("a")
    expect(links).toHaveLength(1)
    const link = links[0]
    expect(link?.getAttribute("href")).toBe("#token-usage")
    // ラベル・割合・量の文字がリンクの外（同じ行の兄弟要素）にあることを確かめる。
    expect(link?.textContent?.includes("コンテキスト")).toBe(false)
    expect(link?.textContent?.includes("30%")).toBe(false)
    expect(link?.textContent?.includes("60.0k")).toBe(false)
  })

  it("`›` の aria-label で割合が読める", () => {
    renderRow(readyContextUsage())

    const link = document.querySelector("a[href='#token-usage']")
    expect(link?.getAttribute("aria-label")).toBe(
      "コンテキスト 30% 使用。トークン消費の画面で詳しく見る",
    )
  })

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
    // 「まだ届いていない」を測るための1回だけ、`fetch` を差し替える。**戻ってこない
    // Promise**にする——中途半端に解決する Promise を残すと、後片付けのタイミング次第で
    // 次のテストの act 外の更新として警告が出るため（`setQueryData` を使わない唯一の理由）。
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof globalThis.fetch
    try {
      renderRow(undefined)

      expect(screen.queryByText("取得中…")).not.toBeNull()
      expect(screen.queryByText("—")).not.toBeNull()
      const link = document.querySelector("a[href='#token-usage']")
      expect(link?.getAttribute("aria-label")).toBe(
        "コンテキスト 取得中。トークン消費の画面で詳しく見る",
      )
    } finally {
      globalThis.fetch = originalFetch
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
