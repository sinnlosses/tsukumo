import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"

import { PresentationalTokenUsageScreen } from "../../../../src/browser/features/token-usage/presentational-token-usage-screen.tsx"
import {
  EMPTY_TOKEN_USAGE_SUMMARY,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageSummary,
  type TokenUsageTotals,
} from "../../../../src/shared/token-usage-summary.ts"

/**
 * 見た目だけを測る（`hooks/use-token-usage.ts` は素通しなので、フィクスチャは手で書いた
 * 架空の集計をそのまま渡す。`docs/coding-standards.md`「会話内容の扱い」— 集計に文面は
 * 入らないが、実物は使わない）。
 */

afterEach(() => {
  cleanup()
})

// 架空の合計（`docs/coding-standards.md`「会話内容の扱い」— 実物の記録は使わない）。
const FIXTURE_TOTALS: TokenUsageTotals = {
  inputTokens: 100,
  outputTokens: 200,
  thinkingTokens: 0,
  cacheReadInputTokens: 5000,
  cacheCreationInputTokens: 10,
  costUsd: 0.5,
}

/** 記録の無い刻み（0の点）。**推移はこれも並べる**ので、棒の本数は期間の刻みの数になる。 */
const EMPTY_TOTALS: TokenUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
}

const FIXTURE_MODEL: ModelUsageTotal = { model: "架空モデル", totals: FIXTURE_TOTALS }

const FIXTURE_SUMMARY: TokenUsageSummary = {
  trend: {
    unit: "day",
    points: [
      { key: "2001-02-03", totals: EMPTY_TOTALS },
      { key: "2001-02-04", totals: FIXTURE_TOTALS },
      { key: "2001-02-05", totals: FIXTURE_TOTALS },
    ],
  },
  byModel: [FIXTURE_MODEL],
  byTool: [],
}

/** 今日を時間ごとに割った推移（24点。記録があるのは9時だけ）。 */
const TODAY_SUMMARY: TokenUsageSummary = {
  trend: {
    unit: "hour",
    points: Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour).padStart(2, "0"),
      totals: hour === 9 ? FIXTURE_TOTALS : EMPTY_TOTALS,
    })),
  },
  byModel: [FIXTURE_MODEL],
  byTool: [],
}

type RenderOptions = {
  readonly plan: string | undefined
  readonly days: TokenUsageDays
  readonly summary: TokenUsageSummary
  readonly onDaysChange: (days: TokenUsageDays) => void
}

const DEFAULT_OPTIONS: RenderOptions = {
  plan: undefined,
  days: 7,
  summary: FIXTURE_SUMMARY,
  onDaysChange: () => {},
}

/** 内訳は別のテスト（`context-usage-card.test.tsx`）で測るので、ここでは取れない側で描く。 */
function renderScreen(options: Partial<RenderOptions> = {}): ReturnType<typeof render> {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  return render(
    <PresentationalTokenUsageScreen
      days={merged.days}
      onDaysChange={merged.onDaysChange}
      summary={merged.summary}
      total={FIXTURE_TOTALS}
      isError={false}
      plan={merged.plan}
      contextUsage={{ kind: "unavailable" }}
    />,
  )
}

describe("PresentationalTokenUsageScreen", () => {
  it("期間の消費は札4枚（入力・出力・キャッシュ読み・キャッシュ作成）で、費用は出さない", () => {
    const { container, queryByText } = renderScreen()

    // モデル別・ツール別も同じ `.usage-card` の枠を使うので、期間の合計の行だけに絞る。
    const periodRow = container.querySelector(".usage-card-row")
    expect(periodRow?.querySelectorAll(".usage-card")).toHaveLength(4)
    expect(
      [...(periodRow?.querySelectorAll(".usage-card-label") ?? [])].map((node) => node.textContent),
    ).toEqual(["入力", "出力", "キャッシュ読み", "キャッシュ作成"])
    expect(queryByText("費用")).toBeNull()
  })

  it("札ごとに、その札の中でいちばん高い棒の値を添える（縦軸は札ごとに独立する）", () => {
    const { container } = renderScreen()

    const peaks = [...container.querySelectorAll(".usage-card-peak")].map(
      (node) => node.textContent,
    )
    expect(peaks).toEqual(["最大 100", "最大 200", "最大 5.00k", "最大 10"])
  })

  it("棒は期間の刻みの数だけ並び、記録の無い刻みも0の棒として入る", () => {
    const { container } = renderScreen()

    const bars = container
      .querySelectorAll(".usage-card-row .usage-card")[0]
      ?.querySelectorAll(".usage-card-bar")
    expect(bars).toHaveLength(3)
    expect([...(bars ?? [])].map((bar) => bar.getAttribute("style"))).toEqual([
      "--usage-bar-height: 0%;",
      "--usage-bar-height: 100%;",
      "--usage-bar-height: 100%;",
    ])
  })

  it("期間の両端だけにラベルを付ける（日ごとは MM-DD）", () => {
    const { container } = renderScreen()

    const scale = container.querySelector(".usage-card-scale")
    expect([...(scale?.querySelectorAll("span") ?? [])].map((node) => node.textContent)).toEqual([
      "02-03",
      "02-05",
    ])
  })

  it("今日を選んだときは棒が24本になり、両端は 0時 と 23時", () => {
    const { container } = renderScreen({ days: 1, summary: TODAY_SUMMARY })

    const bars = container
      .querySelectorAll(".usage-card-row .usage-card")[0]
      ?.querySelectorAll(".usage-card-bar")
    expect(bars).toHaveLength(24)
    const scale = container.querySelector(".usage-card-scale")
    expect([...(scale?.querySelectorAll("span") ?? [])].map((node) => node.textContent)).toEqual([
      "0時",
      "23時",
    ])
  })

  it("期間は「今日 / 7日 / 30日」の3つで、選んでいるものが押された状態になる", () => {
    const { getByText } = renderScreen({ days: 7 })

    expect(getByText("今日").getAttribute("aria-pressed")).toBe("false")
    expect(getByText("7日").getAttribute("aria-pressed")).toBe("true")
    expect(getByText("30日").getAttribute("aria-pressed")).toBe("false")
  })

  it("期間を押すと、その日数で取り直すよう伝える", () => {
    const asked: number[] = []
    const { getByText } = renderScreen({ onDaysChange: (days) => asked.push(days) })

    fireEvent.click(getByText("今日"))
    fireEvent.click(getByText("30日"))

    expect(asked).toEqual([1, 30])
  })

  it("記録が無い期間は一言だけを出す（札も表も出さない）", () => {
    const { container, getByText } = renderScreen({ summary: EMPTY_TOKEN_USAGE_SUMMARY })

    expect(getByText("この期間の記録はまだ無い")).not.toBeNull()
    expect(container.querySelectorAll(".usage-card")).toHaveLength(0)
    expect(container.querySelectorAll(".token-usage-table")).toHaveLength(0)
    // 期間の切り替えだけは残る（切り替えられないと記録のある期間へ戻れない）。
    expect(getByText("30日")).not.toBeNull()
  })

  it("モデル別の表に費用の列を出さない。列名は略さない", () => {
    const { container } = renderScreen()

    // 表は「モデル別」が先、「ツール別」が後（`presentational-token-usage-screen.tsx` の並び）。
    const modelTable = container.querySelectorAll(".token-usage-table")[0]
    const headers = [...(modelTable?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent,
    )
    expect(headers).not.toContain("費用")
    expect(headers).toEqual(["モデル", "入力", "出力", "キャッシュ読み", "キャッシュ作成"])
  })

  it("モデル別・ツール別の札を横に並べ、見出しの横に並べ順を添える", () => {
    const { container } = renderScreen()

    const heads = [...container.querySelectorAll(".usage-table-head")]
    expect(heads.map((head) => head.textContent)).toEqual([
      "モデル別出力の多い順",
      "ツール別結果の大きい順",
    ])
  })

  it("モデル別は出力の多い順に並び、同じ出力ならモデル名の昇順になる", () => {
    const summary: TokenUsageSummary = {
      ...FIXTURE_SUMMARY,
      byModel: [
        { model: "少ない出力", totals: { ...FIXTURE_TOTALS, outputTokens: 10 } },
        { model: "多い出力", totals: { ...FIXTURE_TOTALS, outputTokens: 900 } },
        { model: "zeta-同点", totals: { ...FIXTURE_TOTALS, outputTokens: 10 } },
      ],
    }
    const { container } = renderScreen({ summary })

    const modelTable = container.querySelectorAll(".token-usage-table")[0]
    const names = [...(modelTable?.querySelectorAll("tbody th") ?? [])].map(
      (cell) => cell.textContent,
    )
    // 並べ替えは表示側の責務ではなく届いた順のまま描くので、渡した順がそのまま表になる。
    expect(names).toEqual(["少ない出力", "多い出力", "zeta-同点"])
  })

  it("モデル別は出力の列だけに横棒を添える", () => {
    const { container } = renderScreen()

    const modelTable = container.querySelectorAll(".token-usage-table")[0]
    const row = modelTable?.querySelector("tbody tr")
    const cells = [...(row?.querySelectorAll("td") ?? [])]
    // 入力・出力・キャッシュ読み・キャッシュ作成の4つの数の列のうち、棒があるのは出力だけ。
    expect(cells.map((cell) => cell.querySelector(".usage-table-bar") !== null)).toEqual([
      false,
      true,
      false,
      false,
    ])
  })

  it("ツール別は上から6件だけ出し、残りは「ほか n 件を見る」で開く", () => {
    const byTool = Array.from({ length: 9 }, (_, index) => ({
      name: `ツール${index}`,
      calls: 1,
      resultBytes: 9 - index,
    }))
    const { container, getByText, queryByText } = renderScreen({
      summary: { ...FIXTURE_SUMMARY, byTool },
    })

    const toolTable = container.querySelectorAll(".token-usage-table")[1]
    expect(toolTable?.querySelectorAll("tbody tr")).toHaveLength(6)
    expect(getByText("ほか 3 件を見る")).not.toBeNull()

    fireEvent.click(getByText("ほか 3 件を見る"))

    expect(toolTable?.querySelectorAll("tbody tr")).toHaveLength(9)
    // 開いたあとは閉じる口も置く（毎回スクロールで6件目より下を探さずに戻せるように）。
    expect(queryByText("ほか 3 件を見る")).toBeNull()
    expect(getByText("閉じる")).not.toBeNull()

    fireEvent.click(getByText("閉じる"))

    expect(toolTable?.querySelectorAll("tbody tr")).toHaveLength(6)
  })

  it("ツール別は結果の大きさの列だけに横棒を添える", () => {
    const { container } = renderScreen({
      summary: {
        ...FIXTURE_SUMMARY,
        byTool: [{ name: "Bash", calls: 5, resultBytes: 1000 }],
      },
    })

    const toolTable = container.querySelectorAll(".token-usage-table")[1]
    const row = toolTable?.querySelector("tbody tr")
    const cells = [...(row?.querySelectorAll("td") ?? [])]
    // 回数・結果の大きさの2つの数の列のうち、棒があるのは結果の大きさだけ。
    expect(cells.map((cell) => cell.querySelector(".usage-table-bar") !== null)).toEqual([
      false,
      true,
    ])
  })

  it("plan が届いていれば題の右に札で出す", () => {
    const { queryByText } = renderScreen({ plan: "max" })

    expect(queryByText("max")).not.toBeNull()
  })

  it("plan が届いていなければ札を出さない", () => {
    const { container } = renderScreen()

    expect(container.querySelector(".token-usage-plan")).toBeNull()
  })
})
