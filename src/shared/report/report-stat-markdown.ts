// 数の塊（`stats`）を HTML に組む。前の値・折れ線・割合の帯もここが持つ。

import type { ReportBlock } from "./report-block.ts"
import { htmlInlineWithCode } from "./report-inline-markdown.ts"
import { NUMERIC_CELL_PATTERN, numericCellMagnitude } from "./report-table-markdown.ts"

type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]

export function statMarkdown({ before, value, total, label, series, better }: StatItem): string {
  const beforeHtml =
    before.trim() === ""
      ? ""
      : `<span class="${statBeforeClass(before, value, better)}">${htmlInlineWithCode(before)} →</span>`
  const totalHtml =
    total.trim() === "" ? "" : `<span class="stat-total"> / ${htmlInlineWithCode(total)}</span>`
  return `<div class="stat">${beforeHtml}<b>${statSparkMarkdown(series)}${htmlInlineWithCode(value)}${totalHtml}</b>${statMeterMarkdown(value, total)}${htmlInlineWithCode(label)}</div>`
}

/** 前と後がどちらも数で `better` があるときだけ、増減が良い向きなら `stat-better`・逆なら `stat-worse` を足す。差は計算しない。 */
function statBeforeClass(before: string, value: string, better: StatItem["better"]): string {
  if (better === "" || !NUMERIC_CELL_PATTERN.test(before) || !NUMERIC_CELL_PATTERN.test(value)) {
    return "stat-before"
  }
  const from = numericCellMagnitude(before)
  const to = numericCellMagnitude(value)
  if (from === to) {
    return "stat-before"
  }
  const improved = better === "up" ? to > from : to < from
  return improved ? "stat-before stat-better" : "stat-before stat-worse"
}

const STAT_SPARK_WIDTH = 48
const STAT_SPARK_HEIGHT = 12
const STAT_SPARK_MARGIN = 1.5
const STAT_SPARK_MIN_POINTS = 3

/** 3つ以上の数の並びを、語の高さの折れ線（最新の点だけ円）にする。最大が上、全部同じなら中央。 */
function statSparkMarkdown(series: readonly number[]): string {
  if (series.length < STAT_SPARK_MIN_POINTS) {
    return ""
  }
  const low = Math.min(...series)
  const high = Math.max(...series)
  const round = (number: number): string => String(Math.round(number * 10) / 10)
  const points = series.map((number, index) => ({
    x:
      STAT_SPARK_MARGIN +
      (index * (STAT_SPARK_WIDTH - 2 * STAT_SPARK_MARGIN)) / (series.length - 1),
    y:
      high === low
        ? STAT_SPARK_HEIGHT / 2
        : STAT_SPARK_MARGIN +
          ((high - number) / (high - low)) * (STAT_SPARK_HEIGHT - 2 * STAT_SPARK_MARGIN),
  }))
  const last = points.at(-1)
  if (last === undefined) {
    return ""
  }
  const path = points.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ")
  return (
    `<svg viewBox="0 0 ${String(STAT_SPARK_WIDTH)} ${String(STAT_SPARK_HEIGHT)}" aria-hidden="true">` +
    `<polyline points="${path}"/>` +
    `<circle cx="${round(last.x)}" cy="${round(last.y)}" r="1.2"/></svg>`
  )
}

/** 数と全体の数がどちらも数字で、数が全体に収まるときだけ、割合の帯を返す。 */
function statMeterMarkdown(value: string, total: string): string {
  if (!NUMERIC_CELL_PATTERN.test(value) || !NUMERIC_CELL_PATTERN.test(total)) {
    return ""
  }
  const part = numericCellMagnitude(value)
  const whole = numericCellMagnitude(total)
  if (whole <= 0 || part < 0 || part > whole) {
    return ""
  }
  const width = Math.round((part / whole) * 100)
  return `<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: ${String(width)}%"></span></span>`
}
