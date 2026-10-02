// 体験の数を、期間ごと（または境目の前後）に畳む集計。
// 平均ではなく中央値と90パーセンタイルで畳む（ターンの長さは裾が長く、1回の長いターンで平均が動く）。

import { sortBy, sumBy } from "remeda"

import type { ExperienceMetricEntry } from "./experience-metric.ts"

/** 畳み方。境目（エポックミリ秒）の前後に分けるか、全体を1つにするか。 */
export type ExperienceSplit =
  | { readonly kind: "whole" }
  | { readonly kind: "around"; readonly boundary: number }

/** 1つの塊の数の広がり。1件も無ければ `empty`。 */
export type Spread =
  | { readonly kind: "empty" }
  | { readonly kind: "measured"; readonly median: number; readonly p90: number }

/** 期間1つぶんの集計。 */
export type ExperienceSummary = {
  readonly range: "whole" | "before" | "after"
  /** `deliver` で閉じた依頼の数。 */
  readonly delivered: number
  /** `stumble` で閉じた依頼の数。 */
  readonly stumbled: number
  /** 依頼から結論まで（閉じた依頼すべて）。 */
  readonly untilConclusionMs: Spread
  /** 答え待ちのあった依頼の数。 */
  readonly asked: number
  /** 答え待ちのあった依頼の、答え待ちの時間。 */
  readonly askingMs: Spread
  readonly askingTotalMs: number
  readonly recoveries: number
  readonly hands: Spread
  readonly untilRecoveryMs: Spread
}

export function summarizeExperienceMetric(
  entries: readonly ExperienceMetricEntry[],
  split: ExperienceSplit,
): readonly ExperienceSummary[] {
  if (split.kind === "whole") {
    return [summarizeRange("whole", entries)]
  }
  return [
    summarizeRange(
      "before",
      entries.filter((entry) => entry.at < split.boundary),
    ),
    summarizeRange(
      "after",
      entries.filter((entry) => entry.at >= split.boundary),
    ),
  ]
}

function summarizeRange(
  range: ExperienceSummary["range"],
  entries: readonly ExperienceMetricEntry[],
): ExperienceSummary {
  const conclusions = entries.flatMap((entry) => (entry.kind === "conclusion" ? [entry] : []))
  const recoveries = entries.flatMap((entry) => (entry.kind === "recovery" ? [entry] : []))
  const asked = conclusions.filter((entry) => entry.askCount > 0)
  return {
    range,
    delivered: conclusions.filter((entry) => entry.moment === "deliver").length,
    stumbled: conclusions.filter((entry) => entry.moment === "stumble").length,
    untilConclusionMs: spreadOf(conclusions.map((entry) => entry.untilConclusionMs)),
    asked: asked.length,
    askingMs: spreadOf(asked.map((entry) => entry.askingMs)),
    askingTotalMs: sumBy(asked, (entry) => entry.askingMs),
    recoveries: recoveries.length,
    hands: spreadOf(recoveries.map((entry) => entry.hands)),
    untilRecoveryMs: spreadOf(recoveries.map((entry) => entry.untilRecoveryMs)),
  }
}

/**
 * 中央値と90パーセンタイル（どちらも最も近い順位の値。補間しない）。
 * 偶数件の中央値は、真ん中の2つのうち小さいほう。
 */
function spreadOf(values: readonly number[]): Spread {
  const sorted = sortBy(values, (value) => value)
  const pick = (ratio: number) => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]
  const median = pick(0.5)
  const p90 = pick(0.9)
  return median === undefined || p90 === undefined
    ? { kind: "empty" }
    : { kind: "measured", median, p90 }
}
