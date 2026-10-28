// 数の札（`stats` の項目）の、前の値の色・折れ線の点・割合の帯の幅。
// Markdown に組む側と React の部品が、同じ決まりを読む。

import type { ReportBlock } from "./report-block.ts"
import { NUMERIC_CELL_PATTERN, numericCellMagnitude } from "./table-layout.ts"

type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]

type Point = { readonly x: number; readonly y: number }

export type StatLayout = {
  readonly beforeTone: "plain" | "better" | "worse"
  readonly spark:
    | { readonly kind: "none" }
    | { readonly kind: "line"; readonly points: readonly Point[]; readonly last: Point }
  readonly meter: { readonly kind: "none" } | { readonly kind: "meter"; readonly percent: number }
}

export const STAT_SPARK_WIDTH = 48
export const STAT_SPARK_HEIGHT = 12
export const STAT_SPARK_RADIUS = 1.2
const STAT_SPARK_MARGIN = 1.5
const STAT_SPARK_MIN_POINTS = 3

export function statLayoutOf(item: StatItem): StatLayout {
  return {
    beforeTone: beforeToneOf(item),
    spark: sparkOf(item.series),
    meter: meterOf(item.value, item.total),
  }
}

/** 前と後がどちらも数で `better` があるときだけ、増減が良い向きなら `better`・逆なら `worse`。差は計算しない。 */
function beforeToneOf({ before, value, better }: StatItem): StatLayout["beforeTone"] {
  if (better === "" || !NUMERIC_CELL_PATTERN.test(before) || !NUMERIC_CELL_PATTERN.test(value)) {
    return "plain"
  }
  const from = numericCellMagnitude(before)
  const to = numericCellMagnitude(value)
  if (from === to) {
    return "plain"
  }
  const improved = better === "up" ? to > from : to < from
  return improved ? "better" : "worse"
}

/** 3つ以上の数の並びを、語の高さの折れ線（最新の点だけ円）にする。最大が上、全部同じなら中央。座標は小数 1 桁に丸める。 */
function sparkOf(series: readonly number[]): StatLayout["spark"] {
  if (series.length < STAT_SPARK_MIN_POINTS) {
    return { kind: "none" }
  }
  const low = Math.min(...series)
  const high = Math.max(...series)
  const points = series.map((number, index) => ({
    x: round(
      STAT_SPARK_MARGIN +
        (index * (STAT_SPARK_WIDTH - 2 * STAT_SPARK_MARGIN)) / (series.length - 1),
    ),
    y: round(
      high === low
        ? STAT_SPARK_HEIGHT / 2
        : STAT_SPARK_MARGIN +
            ((high - number) / (high - low)) * (STAT_SPARK_HEIGHT - 2 * STAT_SPARK_MARGIN),
    ),
  }))
  const last = points.at(-1)
  return last === undefined ? { kind: "none" } : { kind: "line", points, last }
}

function round(number: number): number {
  return Math.round(number * 10) / 10
}

/** 数と全体の数がどちらも数字で、数が全体に収まるときだけ、割合の帯の幅（%）を返す。 */
function meterOf(value: string, total: string): StatLayout["meter"] {
  if (!NUMERIC_CELL_PATTERN.test(value) || !NUMERIC_CELL_PATTERN.test(total)) {
    return { kind: "none" }
  }
  const part = numericCellMagnitude(value)
  const whole = numericCellMagnitude(total)
  if (whole <= 0 || part < 0 || part > whole) {
    return { kind: "none" }
  }
  return { kind: "meter", percent: Math.round((part / whole) * 100) }
}
