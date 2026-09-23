import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"
import { act } from "react"

import { PresentationalTokenUsageScreen } from "../../../../src/browser/features/token-usage/presentational-token-usage-screen.tsx"
import {
  type ModelUsageTotal,
  type TokenUsageSummary,
  type TokenUsageTotals,
} from "../../../../src/shared/token-usage-summary.ts"

/**
 * 見た目だけを測る（`hooks/use-token-usage.ts` は素通しなので、フィクスチャは手で書いた
 * 架空の集計をそのまま渡す。`docs/coding-standards.md`「会話内容の扱い」— 集計に文面は
 * 入らないが、実物は使わない）。
 *
 * **日ごとのグラフ（`DailyUsageChart`）の `useEffect` は同梱スクリプトの読み込みを試み、この
 * テスト環境（happy-dom。実際のネットワークが無い）では失敗して1回だけ状態を更新する**
 * （`test/browser/features/main-view/markdown/markdown.test.tsx` と同じ事情）。その1回分を
 * `flushEffects` で待ってから DOM を見る（`act` の外で起きる更新の警告を防ぐ）。
 */

afterEach(() => {
  cleanup()
})

async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// 架空の合計（`docs/coding-standards.md`「会話内容の扱い」— 実物の記録は使わない）。
const FIXTURE_TOTALS: TokenUsageTotals = {
  inputTokens: 100,
  outputTokens: 200,
  thinkingTokens: 0,
  cacheReadInputTokens: 5000,
  cacheCreationInputTokens: 10,
  costUsd: 0.5,
}

const FIXTURE_MODEL: ModelUsageTotal = { model: "架空モデル", totals: FIXTURE_TOTALS }

const FIXTURE_SUMMARY: TokenUsageSummary = {
  byDay: [
    { date: "2001-02-03", totals: FIXTURE_TOTALS },
    { date: "2001-02-04", totals: FIXTURE_TOTALS },
  ],
  byModel: [FIXTURE_MODEL],
  byTool: [],
}

function renderScreen(): ReturnType<typeof render> {
  return render(
    <PresentationalTokenUsageScreen
      days={7}
      onDaysChange={() => {}}
      summary={FIXTURE_SUMMARY}
      total={FIXTURE_TOTALS}
      isError={false}
    />,
  )
}

describe("PresentationalTokenUsageScreen", () => {
  it("合計の並びに費用の項目を出さない（集計には costUsd が残っていても画面には出さない）", async () => {
    const { container, queryByText } = renderScreen()
    await flushEffects()

    expect(queryByText("費用")).toBeNull()
    // 合計は入力・出力・キャッシュ読み・キャッシュ作成の4つだけ。
    expect(container.querySelectorAll(".token-usage-figure")).toHaveLength(4)
  })

  it("モデル別の表に費用の列を出さない", async () => {
    const { container } = renderScreen()
    await flushEffects()

    // 表は「モデル別」が先、「ツール別」が後（`presentational-token-usage-screen.tsx` の並び）。
    const modelTable = container.querySelectorAll(".token-usage-table")[0]
    const headers = [...(modelTable?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent,
    )
    expect(headers).not.toContain("費用")
    expect(headers).toEqual(["モデル", "入力", "出力", "読み", "作成"])
  })

  it("日ごとのグラフは2枚（上: トークン、下: キャッシュ読み）に分かれる", async () => {
    const { container } = renderScreen()
    await flushEffects()

    const canvases = container.querySelectorAll(".token-usage-canvas")
    expect(canvases).toHaveLength(2)
    // 2枚とも <canvas> を1枚ずつ持つ（同じグラフを描き直しているわけではない）。
    for (const chart of canvases) {
      expect(chart.querySelectorAll("canvas")).toHaveLength(1)
    }
  })
})
