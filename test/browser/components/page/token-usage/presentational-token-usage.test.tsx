import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type {
  ModelRowView,
  PeriodChoiceView,
  ToolRowView,
  TokenUsageReport,
} from "../../../../../src/browser/components/page/token-usage/hooks/use-token-usage.ts"
import type { UseUsageReviewResult } from "../../../../../src/browser/components/page/token-usage/hooks/use-usage-review.ts"
import { PresentationalTokenUsage } from "../../../../../src/browser/components/page/token-usage/presentational-token-usage.tsx"
import type {
  TokenUsageDays,
  TokenUsageTotals,
  TokenUsageTrend,
} from "../../../../../src/shared/token-usage/token-usage-summary.ts"

/**
 * 見た目だけを測る（文字・割合への畳みは `useTokenUsage` が持つので、フィクスチャは手で書いた
 * 架空の値をそのまま渡す）。
 */

afterEach(() => {
  cleanup()
})

const FIXTURE_TOTALS: TokenUsageTotals = {
  inputTokens: 100,
  outputTokens: 200,
  thinkingTokens: 0,
  cacheReadInputTokens: 5000,
  cacheCreationInputTokens: 10,
  costUsd: 0.5,
}

/** 記録の無い刻み（0の点）。推移はこれも並べるので、棒の本数は期間の刻みの数になる。 */
const EMPTY_TOTALS: TokenUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
}

const FIXTURE_TREND: TokenUsageTrend = {
  unit: "day",
  points: [
    { key: "2001-02-03", totals: EMPTY_TOTALS },
    { key: "2001-02-04", totals: FIXTURE_TOTALS },
    { key: "2001-02-05", totals: FIXTURE_TOTALS },
  ],
}

/** 今日を時間ごとに割った推移（24点。記録があるのは9時だけ）。 */
const TODAY_TREND: TokenUsageTrend = {
  unit: "hour",
  points: Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour).padStart(2, "0"),
    totals: hour === 9 ? FIXTURE_TOTALS : EMPTY_TOTALS,
  })),
}

const FIXTURE_MODEL: ModelRowView = {
  model: "架空モデル",
  input: "100",
  output: "200",
  outputShare: "100%",
  cacheRead: "5.00k",
  cacheCreation: "10",
}

type ReadyReport = Extract<TokenUsageReport, { kind: "ready" }>

const FIXTURE_REPORT: ReadyReport = {
  kind: "ready",
  periodCards: [
    { label: "入力", value: "100", pick: (totals) => totals.inputTokens },
    { label: "出力", value: "200", pick: (totals) => totals.outputTokens },
    { label: "キャッシュ読み", value: "5.00k", pick: (totals) => totals.cacheReadInputTokens },
    { label: "キャッシュ作成", value: "10", pick: (totals) => totals.cacheCreationInputTokens },
  ],
  trend: FIXTURE_TREND,
  models: [FIXTURE_MODEL],
  tools: { rows: [], more: { kind: "none" } },
}

type RenderOptions = {
  readonly plan: string | undefined
  readonly days: TokenUsageDays
  readonly report: TokenUsageReport
  readonly onDaysChange: (days: TokenUsageDays) => void
}

const DEFAULT_OPTIONS: RenderOptions = {
  plan: undefined,
  days: 7,
  report: FIXTURE_REPORT,
  onDaysChange: () => {},
}

function periodChoicesOf(days: TokenUsageDays): readonly PeriodChoiceView[] {
  return [
    { days: 1, label: "今日", pressed: days === 1 },
    { days: 7, label: "7日", pressed: days === 7 },
    { days: 30, label: "30日", pressed: days === 30 },
  ]
}

/** 手で書いたツールの行（結果の大きさの字と割合は架空）。 */
function toolRowsOf(count: number): readonly ToolRowView[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `ツール${index}`,
    calls: 1,
    size: `${9 - index} B`,
    share: "100%",
  }))
}

/**
 * 「減らし方を見てもらう」区画は別のテストで測るので、
 * ここでは「ふだん」の最小の形で描く。
 */
const FIXTURE_USAGE_REVIEW: UseUsageReviewResult = {
  kind: "idle",
  face: { url: undefined, alt: "" },
  start: { kind: "available" },
  onStart: () => {},
  previousReview: { kind: "none" },
}

/** 内訳は別のテストで測るので、ここでは取れない側で描く。 */
function renderScreen(options: Partial<RenderOptions> = {}): ReturnType<typeof render> {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  return render(
    <PresentationalTokenUsage
      days={merged.days}
      onDaysChange={merged.onDaysChange}
      periodChoices={periodChoicesOf(merged.days)}
      report={merged.report}
      plan={merged.plan}
      contextUsage={{ kind: "unavailable" }}
      usageReview={FIXTURE_USAGE_REVIEW}
    />,
  )
}

describe("PresentationalTokenUsage", () => {
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
    const { container } = renderScreen({
      days: 1,
      report: { ...FIXTURE_REPORT, trend: TODAY_TREND },
    })

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

  it("渡された期間の札を並べ、pressed の札だけが押された状態になる", () => {
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
    const { container, getByText } = renderScreen({ report: { kind: "empty" } })

    expect(getByText("この期間の記録はまだ無い")).not.toBeNull()
    expect(container.querySelectorAll(".usage-card")).toHaveLength(0)
    expect(container.querySelectorAll(".token-usage-table")).toHaveLength(0)
    // 期間の切り替えだけは残る（切り替えられないと記録のある期間へ戻れない）。
    expect(getByText("30日")).not.toBeNull()
  })

  it("取れなかったときは一言だけを出す（札も表も出さない）", () => {
    const { container, getByText } = renderScreen({ report: { kind: "failed" } })

    expect(getByText("集計を取れなかった")).not.toBeNull()
    expect(container.querySelectorAll(".usage-card")).toHaveLength(0)
    expect(container.querySelectorAll(".token-usage-table")).toHaveLength(0)
  })

  it("モデル別の表に費用の列を出さない。列名は略さない", () => {
    const { container } = renderScreen()

    // 表は「モデル別」が先、「ツール別」が後（`PresentationalTokenUsage` の並び）。
    const modelTable = container.querySelectorAll(".token-usage-table")[0]
    const headers = [...(modelTable?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent,
    )
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

  it("ツール別は渡された行だけを出し、残りがあれば「ほか n 件を見る」を置いて、押すと切り替えを伝える", () => {
    let toggled = 0
    const { container, getByText } = renderScreen({
      report: {
        ...FIXTURE_REPORT,
        tools: {
          rows: toolRowsOf(6),
          more: {
            kind: "some",
            label: "ほか 3 件を見る",
            onToggle: () => {
              toggled += 1
            },
          },
        },
      },
    })

    const toolTable = container.querySelectorAll(".token-usage-table")[1]
    expect(toolTable?.querySelectorAll("tbody tr")).toHaveLength(6)

    fireEvent.click(getByText("ほか 3 件を見る"))

    expect(toggled).toBe(1)
  })

  it("ツール別は残りが無ければ開閉の口を置かない", () => {
    const { queryByText } = renderScreen({
      report: { ...FIXTURE_REPORT, tools: { rows: toolRowsOf(2), more: { kind: "none" } } },
    })

    expect(queryByText("閉じる")).toBeNull()
  })

  it("ツール別は結果の大きさの列だけに横棒を添える", () => {
    const { container } = renderScreen({
      report: { ...FIXTURE_REPORT, tools: { rows: toolRowsOf(1), more: { kind: "none" } } },
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
