// 離れていたあいだのまとめ（AwayBrief）を、隠れた時点の work-plan の記録の数と今の記録の並びから組む決まり。

import { isDeepEqual } from "remeda"

import { workPlanOf } from "../../../../../shared/session/work-plan-fold.ts"
import type { WorkPlanTrail } from "../../../../../shared/session/work-plan-trail.ts"
import { type LatestWorkPlan, plannedPhasesOf } from "../../../../../shared/session/work-plan.ts"
import { isBlankText } from "../../../../../shared/utils/blank-text.ts"
import type { WorkPlanAsk } from "./work-plan-ask-row.ts"
import type { WorkPlanRow } from "./work-plan-row.ts"

/** これより短く隠れていただけなら、離れていたとしない（Claude Code の session recap と同じ 3 分）。 */
export const AWAY_MIN_MS = 3 * 60 * 1000

type WorkPlanRecord = WorkPlanTrail["plans"][number]

/**
 * 隠れた時点で今の依頼の `work-plan` の記録を何件持っていたか（`count`）と、その最初の記録（`first`）。
 * 戻ったときに `first` が今の最初の記録と違えば、依頼が替わったとみなす。
 */
export type SeenWorkPlans = {
  readonly count: number
  readonly first: WorkPlanRecord
}

/** 印より後に済んだ段1つ。`touched` は触ったファイルの数。 */
export type AwayChange = {
  readonly key: string
  readonly title: string
  readonly summary: string
  readonly touched: number
}

/**
 * 離れていたあいだのまとめ。
 * `minutes` は離れていた分、`total`・`settled` は今の段の数と済んだ段の数。
 * `waiting` は答え待ちの問い、`changes` は印より後に済んだ段、`assumptions` は印より後に増えた前提、
 * `replans` は印より後に計画を直した理由（空なら計画どおり）。
 * `markBeforeRowKey` は「ここから先は、前に見たあと」の印を前に引く行で、段が全部済んでいれば `none`。
 */
export type AwayBrief =
  | { readonly kind: "none" }
  | {
      readonly kind: "brief"
      readonly minutes: number
      readonly total: number
      readonly settled: number
      readonly waiting: WorkPlanAsk
      readonly changes: readonly AwayChange[]
      readonly assumptions: readonly string[]
      readonly replans: readonly string[]
      readonly markBeforeRowKey:
        | { readonly kind: "none" }
        | { readonly kind: "row"; readonly key: string }
    }

export type AwayBriefSource = {
  /** ページが隠れていた時間（ミリ秒）。 */
  readonly awayMs: number
  readonly seen: SeenWorkPlans
  readonly plan: LatestWorkPlan
  readonly trail: WorkPlanTrail
  readonly rows: readonly WorkPlanRow[]
  readonly ask: WorkPlanAsk
}

export const NO_AWAY_BRIEF = { kind: "none" } as const satisfies AwayBrief

const MINUTE_MS = 60 * 1000

/**
 * 離れていたあいだのまとめ。次のどれかなら `none`:
 * {@link AWAY_MIN_MS} より短い・計画が無い・依頼が替わった（記録が隠れた時点より少ないか、最初の記録が違う）・
 * 印より後に済んだ段も増えた前提も直した計画も無く、問いも無い。
 */
export function awayBriefOf(source: AwayBriefSource): AwayBrief {
  const { awayMs, seen, plan, trail, rows, ask } = source
  const seenLast = trail.plans[seen.count - 1]
  if (
    awayMs < AWAY_MIN_MS ||
    plan.kind !== "planned" ||
    seenLast === undefined ||
    !isDeepEqual(trail.plans[0], seen.first)
  ) {
    return NO_AWAY_BRIEF
  }
  const seenSettled = new Set(
    plannedPhasesOf(workPlanOf(seenLast))
      .filter((phase) => phase.state === "done")
      .map((phase) => phase.key),
  )
  const settledRows = rows.filter((row) => row.state === "done" || row.state === "skipped")
  const changes = settledRows
    .filter((row) => !seenSettled.has(row.key))
    .map((row) => ({
      key: row.key,
      title: row.title,
      summary: row.summary,
      touched: row.touched.length,
    }))
  const seenAssumptions = new Set(seenLast.assumptions ?? [])
  const assumptions = (plan.assumptions ?? []).filter((text) => !seenAssumptions.has(text))
  const replans = [
    ...new Set(
      trail.plans
        .slice(seen.count)
        .flatMap((record) =>
          record.replanReason === undefined || isBlankText(record.replanReason)
            ? []
            : [record.replanReason],
        ),
    ),
  ]
  if (
    changes.length === 0 &&
    assumptions.length === 0 &&
    replans.length === 0 &&
    ask.kind === "none"
  ) {
    return NO_AWAY_BRIEF
  }
  const current = rows.find((row) => row.state === "current")
  const markKey = changes[0]?.key ?? current?.key
  return {
    kind: "brief",
    minutes: Math.floor(awayMs / MINUTE_MS),
    total: rows.length,
    settled: settledRows.length,
    waiting: ask,
    changes,
    assumptions,
    replans,
    markBeforeRowKey:
      current === undefined || markKey === undefined
        ? { kind: "none" }
        : { kind: "row", key: markKey },
  }
}
