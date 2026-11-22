// タスクの再試の結果を版ごとに複数受け、同じ版の中で pass^k の可否が揺れた件に印を付け、
// 揺れた件を外して版どうしの通った件数を比べる、という概念1つを持つ。外に触らない。
import { z } from "zod"

import type { ReplaySummary } from "./replay-summary.ts"

/** タスクの再試1回ぶん（`--out` に書く JSON）の結果。 */
export type ReplayResult = {
  readonly cases: readonly { readonly id: string; readonly summary: ReplaySummary }[]
}

/** 同じ版で1件の pass^k が揺れたこと。`counts` は結果ごとの通った回数/回数。 */
export type ReplayFlake = {
  readonly id: string
  readonly version: "baseline" | "candidate"
  readonly counts: readonly { readonly passedRuns: number; readonly runs: number }[]
}

export type ReplayComparison = {
  readonly flakes: readonly ReplayFlake[]
  /** 揺れて合計から外した件の ID。 */
  readonly excluded: readonly string[]
  /** 両方の版にあり、どちらでも揺れなかった件の数。 */
  readonly compared: number
  readonly baselinePassed: number
  readonly candidatePassed: number
}

const replaySummarySchema = z.object({
  passAll: z.boolean(),
  runs: z.number().int().nonnegative(),
  passedRuns: z.number().int().nonnegative(),
  medianTokens: z.number(),
  medianDurationMs: z.number(),
  totalDenials: z.number().int().nonnegative(),
}) satisfies z.ZodType<ReplaySummary>

const replayResultSchema = z.object({
  cases: z.array(z.object({ id: z.string().min(1), summary: replaySummarySchema })),
}) satisfies z.ZodType<ReplayResult>

/** `--out` で書いた JSON を読む。形が崩れていれば `"invalid"`。 */
export function parseReplayResult(json: unknown): ReplayResult | "invalid" {
  const parsed = replayResultSchema.safeParse(json)
  return parsed.success ? parsed.data : "invalid"
}

/**
 * 揺れた件は、同じ版の結果のあいだで passAll が食い違った件と、
 * 1回の `--k` の中で通りと落ちが混ざった件。両方の版にある件だけを比べる。
 */
export function compareReplayVersions(
  baseline: readonly ReplayResult[],
  candidate: readonly ReplayResult[],
): ReplayComparison {
  const baselineCases = groupById(baseline)
  const candidateCases = groupById(candidate)
  const flakes = [
    ...findFlakes(baselineCases, "baseline"),
    ...findFlakes(candidateCases, "candidate"),
  ]
  const excluded = [...new Set(flakes.map((flake) => flake.id))]
  const comparedIds = [...baselineCases.keys()].filter(
    (id) => candidateCases.has(id) && !excluded.includes(id),
  )
  const passedIn = (cases: ReadonlyMap<string, readonly ReplaySummary[]>) =>
    comparedIds.filter((id) => cases.get(id)?.[0]?.passAll === true).length
  return {
    flakes,
    excluded,
    compared: comparedIds.length,
    baselinePassed: passedIn(baselineCases),
    candidatePassed: passedIn(candidateCases),
  }
}

/** 揺れた件を1件1行、続けて外した件・比べた件数・版ごとの通った件数を1行ずつ。 */
export function formatReplayComparison(comparison: ReplayComparison): readonly string[] {
  const versionName = { baseline: "元の版", candidate: "候補の版" } as const
  return [
    ...comparison.flakes.map(
      (flake) =>
        `${flake.id} 揺れ（${versionName[flake.version]}）: ${flake.counts
          .map((count) => `${String(count.passedRuns)}/${String(count.runs)}`)
          .join("・")}`,
    ),
    `揺れて外した件: ${comparison.excluded.length === 0 ? "なし" : comparison.excluded.join(", ")}`,
    `比べた件: ${String(comparison.compared)}`,
    `通った件: 元の版 ${String(comparison.baselinePassed)}・候補の版 ${String(comparison.candidatePassed)}`,
  ]
}

function groupById(
  results: readonly ReplayResult[],
): ReadonlyMap<string, readonly ReplaySummary[]> {
  const grouped = new Map<string, ReplaySummary[]>()
  for (const { id, summary } of results.flatMap((result) => result.cases)) {
    grouped.set(id, [...(grouped.get(id) ?? []), summary])
  }
  return grouped
}

function findFlakes(
  cases: ReadonlyMap<string, readonly ReplaySummary[]>,
  version: ReplayFlake["version"],
): readonly ReplayFlake[] {
  return [...cases]
    .filter(([, summaries]) => isFlaky(summaries))
    .map(([id, summaries]) => ({
      id,
      version,
      counts: summaries.map(({ passedRuns, runs }) => ({ passedRuns, runs })),
    }))
}

function isFlaky(summaries: readonly ReplaySummary[]): boolean {
  const mixedWithinK = summaries.some(
    (summary) => summary.passedRuns > 0 && summary.passedRuns < summary.runs,
  )
  const disagrees = new Set(summaries.map((summary) => summary.passAll)).size > 1
  return mixedWithinK || disagrees
}
