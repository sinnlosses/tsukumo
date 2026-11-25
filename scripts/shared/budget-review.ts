// 上限の実測から、見直しのドラフトに積むもの（超えた上限と、期日の来た定期見直し）を決める。tw にも時計にも触らない。

export type BudgetMeasurement = {
  /** ドラフトの題の頭にも使うので、同じ上限には毎回同じ名前を渡す。 */
  readonly name: string
  readonly unit: "字" | "件"
  readonly current: number
  readonly limit: number
  /** 値を持つ定数の場所。 */
  readonly constant: string
  /** ドラフトの本文に足す行（超えたファイルの一覧・縮める手順など）。 */
  readonly details: readonly string[]
}

export type BudgetDraft = {
  readonly summary: string
  readonly body: string
}

/** 最後に上限の値を見直した日。見直したら今日の日付に書き換える。 */
export const BUDGET_REVIEWED_ON = "2026-11-25"

const BUDGET_REVIEW_INTERVAL_DAYS = 30

const OVER_BUDGET_PREFIX = "上限超過: "
const BUDGET_REVIEW_SUMMARY = "上限の定期見直し: 予算の値を実測と使用量で決め直す"

/** 日付はどちらも `YYYY-MM-DD`。`reviewedOn` は前回の見直しの日（ふだんは `BUDGET_REVIEWED_ON`）。 */
export type ReviewDates = {
  readonly today: string
  readonly reviewedOn: string
}

/** `openSummaries` は閉じていないタスクの題。同じ上限のドラフトが開いていれば積み直さない。 */
export function budgetDrafts(
  measurements: readonly BudgetMeasurement[],
  openSummaries: readonly string[],
  dates: ReviewDates,
): readonly BudgetDraft[] {
  const isOpen = (prefix: string): boolean =>
    openSummaries.some((summary) => summary.startsWith(prefix))
  const overDrafts = measurements
    .filter((measurement) => measurement.current > measurement.limit)
    .filter((measurement) => !isOpen(overPrefixOf(measurement)))
    .map((measurement) => overDraftOf(measurement, dates.today))
  const reviewDraft =
    isReviewDue(dates) && !isOpen(BUDGET_REVIEW_SUMMARY)
      ? [reviewDraftOf(measurements, dates.reviewedOn)]
      : []
  return [...overDrafts, ...reviewDraft]
}

export function formatMeasurement(measurement: BudgetMeasurement): string {
  const { current, limit, unit } = measurement
  const state = current > limit ? `${current - limit}${unit}超え` : `残り ${limit - current}${unit}`
  return `${measurement.name}: ${current}${unit}／上限 ${limit}${unit}（${state}）`
}

function overPrefixOf(measurement: BudgetMeasurement): string {
  return `${OVER_BUDGET_PREFIX}${measurement.name}（`
}

function overDraftOf(measurement: BudgetMeasurement, today: string): BudgetDraft {
  const { current, limit, unit } = measurement
  return {
    summary: `${overPrefixOf(measurement)}${current}${unit}／上限 ${limit}${unit}）を見直す`,
    body: [
      "## 目的・背景",
      "",
      "- 出どころ: `pnpm run token-limit`（上限を超えても検査は落とさず、ここに積む）",
      `- 根拠: ${today} に測って ${formatMeasurement(measurement)}`,
      `- 出し先: 縮めて上限以内に戻すか、上限の値（${measurement.constant}）を見直す。値を上げるなら人の承認を取る`,
      ...measurement.details.map((line) => `- ${line}`),
      "",
    ].join("\n"),
  }
}

function reviewDraftOf(
  measurements: readonly BudgetMeasurement[],
  reviewedOn: string,
): BudgetDraft {
  return {
    summary: BUDGET_REVIEW_SUMMARY,
    body: [
      "## 目的・背景",
      "",
      `- 出どころ: \`pnpm run token-limit\`（前回の見直し ${reviewedOn} から ${String(BUDGET_REVIEW_INTERVAL_DAYS)} 日を過ぎた）`,
      "- 根拠: いまの実測は次のとおり",
      ...measurements.map((measurement) => `  - ${formatMeasurement(measurement)}`),
      "- 出し先: `/token-usage-diet` で毎歩の文脈に載る量を見て、毎歩載る上限は縮める側、たまにしか読まれない上限は丸めた値に決め直す。見直したら `scripts/shared/budget-review.ts` の `BUDGET_REVIEWED_ON` を見直した日にする",
      "",
    ].join("\n"),
  }
}

function isReviewDue({ today, reviewedOn }: ReviewDates): boolean {
  const elapsedDays = Temporal.PlainDate.from(reviewedOn).until(today).days
  return elapsedDays >= BUDGET_REVIEW_INTERVAL_DAYS
}
