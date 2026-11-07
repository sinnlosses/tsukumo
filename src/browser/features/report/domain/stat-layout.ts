// 数のカード（`stats` の項目）の、前の値の色・折れ線の点・割合の帯の幅・目標の達否。
// Markdown に組む側と React の部品が、同じ決まりを読む。

import type { LeafComponent } from "../../../../shared/report/report-block.ts"
import {
  NUMERIC_CELL_PATTERN,
  numericCellMagnitude,
} from "../../../../shared/report/table-layout.ts"

type StatItem = Extract<LeafComponent, { readonly kind: "stats" }>["items"][number]

type Point = { readonly x: number; readonly y: number }

export type StatLayout = {
  readonly beforeTone: "plain" | "better" | "worse"
  readonly spark:
    | { readonly kind: "none" }
    | { readonly kind: "line"; readonly points: readonly Point[]; readonly last: Point }
  readonly meter: { readonly kind: "none" } | { readonly kind: "meter"; readonly percent: number }
  readonly target:
    | { readonly kind: "none" }
    | { readonly kind: "target"; readonly verdict: "met" | "missed" | "unknown" }
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
    target: targetOf(item),
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

/**
 * 数と目標がどちらも単位の同じ数で `better` があるときだけ、`up` なら以上・`down` なら以下で達否を決める（等しければ達成）。
 * 比べられないときは `unknown`。差は計算しない。
 */
function targetOf({ value, target, better }: StatItem): StatLayout["target"] {
  if (target.trim() === "") {
    return { kind: "none" }
  }
  const actual = unitNumberOf(value)
  const goal = unitNumberOf(target)
  if (
    better === "" ||
    actual.kind === "none" ||
    goal.kind === "none" ||
    actual.unit !== goal.unit
  ) {
    return { kind: "target", verdict: "unknown" }
  }
  const met = better === "up" ? actual.number >= goal.number : actual.number <= goal.number
  return { kind: "target", verdict: met ? "met" : "missed" }
}

const UNIT_NUMBER_PATTERN = /^(?<number>-?\d[\d,]*(?:\.\d+)?)\s*(?<unit>\S*)$/

/** `99.9%`・`500ms`・`312 件` を数と末尾の単位の字に割る。 */
function unitNumberOf(
  text: string,
):
  | { readonly kind: "none" }
  | { readonly kind: "number"; readonly number: number; readonly unit: string } {
  const groups = UNIT_NUMBER_PATTERN.exec(text.trim())?.groups
  const number = groups?.["number"]
  if (groups === undefined || number === undefined) {
    return { kind: "none" }
  }
  return { kind: "number", number: numericCellMagnitude(number), unit: groups["unit"] ?? "" }
}
