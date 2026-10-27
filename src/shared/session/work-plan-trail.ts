// 段の所要を計る `work-plan` の記録の並びを、止めて再開した依頼をまたいでつなぐ決まり。

import { isDeepEqual } from "remeda"

import type { RecordTime, SessionRecord } from "./session-record.ts"
import { finishedPhaseCount, phaseCount } from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/** 閉じた依頼1つぶんの `work-plan` の記録（積まれた順）と、その区間を閉じる時刻。 */
export type WorkPlanStretch = {
  readonly plans: readonly WorkPlanRecord[]
  readonly closedAt: RecordTime
}

/**
 * 段の所要を計る記録の並び。
 * `carried` は前の依頼から引き継いだ区間（古い順）、`plans` は今の依頼の `work-plan` の記録（積まれた順）。
 * `awaiting` は、今の依頼の最初の `work-plan` の記録を見て引き継ぐかを決めるまで持つ、前の依頼までの区間。
 * `closedAt` は今の依頼の区間を閉じる時刻（最後の `report` の時刻。そのあとに `work-plan` の記録が来たらその時刻）。
 */
export type WorkPlanTrail = {
  readonly carried: readonly WorkPlanStretch[]
  readonly plans: readonly WorkPlanRecord[]
  readonly awaiting: readonly WorkPlanStretch[]
  readonly closedAt: RecordTime | "none"
}

export const EMPTY_WORK_PLAN_TRAIL = {
  carried: [],
  plans: [],
  awaiting: [],
  closedAt: "none",
} as const satisfies WorkPlanTrail

/**
 * `record` を1件なぞったあとの並び。
 * `request` で今の依頼の区間を閉じて `awaiting` へ移す（`report` が無ければ `request` の時刻で閉じる）。
 * 次の依頼の最初の `work-plan` の記録の `phases` が、前の依頼の最後の記録の `phases` と同じときだけ `awaiting` を `carried` に引き継ぐ。
 * 前の依頼にワークプランが無いか、前の依頼の最後の記録で全部の段が済んでいれば（`finished` の `report` で閉じた）、それより前の区間も引き継がない。
 */
export function advanceWorkPlanTrail(trail: WorkPlanTrail, record: SessionRecord): WorkPlanTrail {
  if (record.kind === "request") {
    const last = trail.plans.at(-1)
    return {
      ...EMPTY_WORK_PLAN_TRAIL,
      awaiting:
        last === undefined || finishedPhaseCount(last) >= phaseCount(last.phases)
          ? []
          : [
              ...trail.carried,
              {
                plans: trail.plans,
                closedAt: trail.closedAt === "none" ? record.time : trail.closedAt,
              },
            ],
    }
  }
  if (record.kind === "report") {
    return { ...trail, closedAt: record.time }
  }
  if (record.kind !== "work-plan") {
    return trail
  }
  const closedAt = trail.closedAt === "none" ? trail.closedAt : record.time
  if (trail.plans.length > 0) {
    return { ...trail, plans: [...trail.plans, record], closedAt }
  }
  return {
    carried: continuesFrom(trail.awaiting, record) ? trail.awaiting : [],
    plans: [record],
    awaiting: [],
    closedAt,
  }
}

function continuesFrom(awaiting: readonly WorkPlanStretch[], record: WorkPlanRecord): boolean {
  const previous = awaiting.at(-1)?.plans.at(-1)
  return previous !== undefined && isDeepEqual(previous.phases, record.phases)
}
