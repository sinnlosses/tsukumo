// 進行の計測値を、期間ごと（または境目の前後）に畳む集計。
// 平均ではなく中央値と90パーセンタイルで畳む（ターンの長さは裾が長く、1回の長いターンで平均が動く）。

import { sortBy, sumBy } from "remeda"

import type { PhaseSpan } from "../../../../shared/session/work-plan-phase-number.ts"
import type { SplitDivider, WaitKind } from "../../../../shared/usage/experience-metric-record.ts"
import {
  USUAL_DURATION_MIN_COUNT,
  type UsualDurations,
  type UsualSpread,
} from "../../../../shared/usage/usual-duration.ts"
import type { ExperienceMetricEntry, SplitEntry } from "./experience-metric.ts"

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
  /** 仕切りごとの、離した回数と離した比率（%）。 */
  readonly splits: Readonly<Record<SplitDivider, SplitSummary>>
}

/** 仕切り1本ぶん。 */
export type SplitSummary = {
  readonly count: number
  readonly released: PercentRange
}

/** 離した比率の中央値と範囲。1件も無ければ `empty`。 */
export type PercentRange =
  | { readonly kind: "empty" }
  | {
      readonly kind: "measured"
      readonly median: number
      readonly min: number
      readonly max: number
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

/**
 * 段の群ごとの `phaseSeconds` と、待ちの種類ごとの `waitSeconds` の件数・中央値・25 と 75 パーセンタイル。
 * 件数が {@link USUAL_DURATION_MIN_COUNT} に足りない塊は `empty`。
 */
export function summarizeUsualDurations(entries: readonly ExperienceMetricEntry[]): UsualDurations {
  const phases = entries.flatMap((entry) => (entry.kind === "phase" ? [entry] : []))
  const waits = entries.flatMap((entry) => (entry.kind === "wait" ? [entry] : []))
  const phaseSpread = (span: PhaseSpan) =>
    usualSpreadOf(phases.filter((entry) => entry.span === span).map((entry) => entry.phaseSeconds))
  const waitSpread = (kind: WaitKind) =>
    usualSpreadOf(
      waits.filter((entry) => entry.waitKind === kind).map((entry) => entry.waitSeconds),
    )
  return {
    phases: {
      whole: phaseSpread("whole"),
      lead: phaseSpread("lead"),
      delegated: phaseSpread("delegated"),
      trail: phaseSpread("trail"),
    },
    waits: {
      bash: waitSpread("bash"),
      agent: waitSpread("agent"),
      workflow: waitSpread("workflow"),
      other: waitSpread("other"),
    },
  }
}

function summarizeRange(
  range: ExperienceSummary["range"],
  entries: readonly ExperienceMetricEntry[],
): ExperienceSummary {
  const conclusions = entries.flatMap((entry) => (entry.kind === "conclusion" ? [entry] : []))
  const recoveries = entries.flatMap((entry) => (entry.kind === "recovery" ? [entry] : []))
  const splits = entries.flatMap((entry) => (entry.kind === "split" ? [entry] : []))
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
    splits: {
      topLeft: summarizeSplits(splits, "topLeft"),
      rowTop: summarizeSplits(splits, "rowTop"),
      bottomLeft: summarizeSplits(splits, "bottomLeft"),
    },
  }
}

function summarizeSplits(splits: readonly SplitEntry[], divider: SplitDivider): SplitSummary {
  const released = splits
    .filter((entry) => entry.divider === divider)
    .map((entry) => entry.releasedPercent)
  const median = spreadOf(released)
  return {
    count: released.length,
    released:
      median.kind === "empty"
        ? median
        : {
            kind: "measured",
            median: median.median,
            min: Math.min(...released),
            max: Math.max(...released),
          },
  }
}

function usualSpreadOf(values: readonly number[]): UsualSpread {
  const sorted = sortBy(values, (value) => value)
  const [first, ...rest] = sorted
  if (first === undefined || sorted.length < USUAL_DURATION_MIN_COUNT) {
    return { kind: "empty", count: sorted.length }
  }
  const ranked: NonEmpty = [first, ...rest]
  return {
    kind: "measured",
    count: sorted.length,
    medianSeconds: rankOf(ranked, 0.5),
    lowSeconds: rankOf(ranked, 0.25),
    highSeconds: rankOf(ranked, 0.75),
  }
}

/**
 * 中央値と90パーセンタイル（どちらも最も近い順位の値。補間しない）。
 * 偶数件の中央値は、真ん中の2つのうち小さいほう。
 */
function spreadOf(values: readonly number[]): Spread {
  const [first, ...rest] = sortBy(values, (value) => value)
  if (first === undefined) {
    return { kind: "empty" }
  }
  const ranked: NonEmpty = [first, ...rest]
  return { kind: "measured", median: rankOf(ranked, 0.5), p90: rankOf(ranked, 0.9) }
}

type NonEmpty = readonly [number, ...number[]]

/** 小さい順に並べた値の、割合 `ratio` に最も近い順位の値（補間しない）。 */
function rankOf(sorted: NonEmpty, ratio: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? sorted[0]
}
