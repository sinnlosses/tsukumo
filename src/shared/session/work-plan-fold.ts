// イベントと記録の並びからいまのワークプランを畳む決まりと、委譲の返却・`report` が段を進める決まり。

import { isBlankText } from "../utils/blank-text.ts"
import type { DelegateReturn } from "./delegate-return.ts"
import type { SessionEvent } from "./session-event.ts"
import type { SessionRecord } from "./session-record.ts"
import {
  finishedPhaseCount,
  NO_AWAITING_SUMMARY,
  phaseCount,
  type LatestWorkPlan,
  type PlannedPhase,
  type PlannedWorkPlan,
  plannedPhasesOf,
  type WorkPlan,
} from "./work-plan.ts"
import type { WorkflowProgress } from "./workflow-step.ts"

/** 今のワークプランを動かすイベント。ほかのイベント（`turn-started` も）はワークプランを動かさない。 */
export type WorkPlanEvent = Extract<
  SessionEvent,
  {
    readonly kind: "request" | "work-plan" | "delegate-returned" | "report" | "workflow-progress"
  }
>

/**
 * イベント1件を受けたあとの今のワークプラン。
 * 依頼で忘れ、`work-plan` で置き換え、委譲の返却は {@link advancedByReturn}、台本の写しは {@link advancedByWorkflowProgress}、
 * フェーズの閉じ方が `finished` の `report` は {@link closedByReport} で畳む。
 */
export function nextWorkPlan(plan: LatestWorkPlan, event: WorkPlanEvent): LatestWorkPlan {
  switch (event.kind) {
    case "request":
      return NO_WORK_PLAN
    case "work-plan":
      return withLeadPhasesFinished(plan, workPlanOf(event))
    case "delegate-returned":
      return plan.kind === "none" ? plan : advancedByReturn(plan, event.handback)
    case "workflow-progress":
      return plan.kind === "none" ? plan : advancedByWorkflowProgress(plan, event.progress)
    case "report":
      return plan.kind === "none" || event.workPlanClosing !== "finished"
        ? plan
        : closedByReport(plan)
  }
}

/** 記録の並びから畳んだ今のワークプラン。記録に残る `request` と `work-plan` を {@link nextWorkPlan} に通す。 */
export function currentWorkPlan(records: readonly SessionRecord[]): LatestWorkPlan {
  return records.reduce<LatestWorkPlan>(
    (plan, record) =>
      record.kind === "request" || record.kind === "work-plan" ? nextWorkPlan(plan, record) : plan,
    NO_WORK_PLAN,
  )
}

const NO_WORK_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

/** `work-plan` のイベントか記録1件が運ぶワークプラン（ワークプランの欄だけを拾う）。 */
export function workPlanOf(plan: WorkPlan): PlannedWorkPlan {
  return {
    kind: "planned",
    phases: plan.phases,
    phaseIds: plan.phaseIds,
    current: plan.current,
    finishedInGroup: plan.finishedInGroup,
    phaseSummary: plan.phaseSummary,
    delegatedRange: plan.delegatedRange,
    skippedPhases: plan.skippedPhases,
    awaitingSummary: plan.awaitingSummary,
  }
}

export function isWorkPlanRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "work-plan" }> {
  return record.kind === "work-plan"
}

/**
 * 委譲の返却で済む帯の段。帯を動かさない返却（{@link advancedByReturn} が `plan` をそのまま返す場合）では `unmoved`。
 */
export function phaseFinishedByReturn(plan: WorkPlan, handback: DelegateReturn): ReturnedPhase {
  const returned = returnedByReturn({ kind: "planned", ...plan }, handback)
  return returned.kind === "finished" ? { kind: "finished", phase: returned.phase } : UNMOVED
}

/** 委譲の返却1件が帯の段を済ませたか（{@link phaseFinishedByReturn}）。 */
export type ReturnedPhase =
  | { readonly kind: "unmoved" }
  | { readonly kind: "finished"; readonly phase: PlannedPhase }

const UNMOVED = { kind: "unmoved" } as const satisfies ReturnedPhase

/** 委譲の返却1件が、段の id を持つワークプランで済んだ段（戻り）かまだの段（飛ばし）を申告したか（段は {@link reportedPhaseOf}）。 */
export function isOutOfOrderReturn(plan: WorkPlan, handback: DelegateReturn): boolean {
  const phase = plan.phaseIds.length === 0 ? undefined : reportedPhaseOf(plan, handback)
  return phase !== undefined && phase.state !== "current"
}

/** 範囲があり `count` が範囲の段の数と同じ `phase-done`・`phase-skipped` の `phase` に当たる段。当たらなければ undefined。 */
function reportedPhaseOf(plan: WorkPlan, handback: DelegateReturn): PlannedPhase | undefined {
  if (
    (handback.kind !== "phase-done" && handback.kind !== "phase-skipped") ||
    plan.delegatedRange.kind !== "range" ||
    plan.delegatedRange.count !== handback.count
  ) {
    return undefined
  }
  const target = plan.delegatedRange.first + handback.phase - 1
  return plannedPhasesOf(plan).find((candidate) => candidate.index === target)
}

/**
 * 範囲を初めて宣言した `work-plan` は、範囲の前の段（計画）を済ませた位置に直す。
 * 範囲の前の段は返却で済まず、範囲の先頭の段は今の段のときにしか返却で済まないので、手で `current` を進め忘れると帯が動かなくなる。
 */
function withLeadPhasesFinished(previous: LatestWorkPlan, next: PlannedWorkPlan): PlannedWorkPlan {
  const hadRange = previous.kind === "planned" && previous.delegatedRange.kind === "range"
  if (hadRange || next.delegatedRange.kind !== "range" || next.finishedInGroup.length > 0) {
    return next
  }
  const { first } = next.delegatedRange
  const lead = plannedPhasesOf(next).find((phase) => phase.index === first)
  return lead === undefined || lead.entry <= next.current ? next : { ...next, current: lead.entry }
}

/**
 * `phase_result` の `finished`（`phase-done`）と `skipped`（`phase-skipped`）で進めたワークプラン。
 * 範囲があり `count` が範囲の段の数と同じで、`phase` に当たる段が今の段の集合に入っているときだけ、その段を済ませる。
 * 一足飛び・済んだ段・範囲の無いワークプラン・`stopped`・並びの最後の段（返却では全部済みにしない）では `plan` をそのまま返す。
 * 段のまとめは返却の要約。まとめが空なら済ませた段をまとめ待ちにする。
 * `phase-skipped` は済ませた段の名前を飛ばした段に足す。
 */
function advancedByReturn(plan: PlannedWorkPlan, handback: DelegateReturn): PlannedWorkPlan {
  const returned = returnedByReturn(plan, handback)
  return returned.kind === "finished" ? returned.advanced : plan
}

function returnedByReturn(
  plan: PlannedWorkPlan,
  handback: DelegateReturn,
):
  | { readonly kind: "unmoved" }
  | {
      readonly kind: "finished"
      readonly phase: PlannedPhase
      readonly advanced: PlannedWorkPlan
    } {
  const phase = reportedPhaseOf(plan, handback)
  if (phase === undefined || phase.state !== "current") {
    return UNMOVED
  }
  const entry = plan.phases[phase.entry]
  const finishedInGroup = typeof entry === "string" ? [] : [...plan.finishedInGroup, phase.name]
  const entryDone =
    entry === undefined || typeof entry === "string" || finishedInGroup.length === entry.length
  const phaseSummary = handback.kind === "phase-done" ? handback.summary : ""
  const skipped = handback.kind === "phase-skipped" && !plan.skippedPhases.includes(phase.name)
  const advanced: PlannedWorkPlan = {
    ...plan,
    current: entryDone ? plan.current + 1 : plan.current,
    finishedInGroup: entryDone ? [] : finishedInGroup,
    phaseSummary,
    skippedPhases: skipped ? [...plan.skippedPhases, phase.name] : plan.skippedPhases,
    awaitingSummary: isBlankText(phaseSummary)
      ? { kind: "awaiting", key: phase.key }
      : NO_AWAITING_SUMMARY,
  }
  return finishedPhaseCount(advanced) >= phaseCount(advanced.phases)
    ? UNMOVED
    : { kind: "finished", phase, advanced }
}

/**
 * 台本の写しで進めたワークプラン。
 * 写しの agent のうち `phaseTitle` が `phaseIds` のどれかに一致するもの（`state` を問わない）で、平らにした並びのいちばん後ろの段を台本が入った段とする。
 * その段の要素が今の要素より後ろのときだけ、その要素を今の要素にして前の段をすべて済ませる。
 * 飛び越えた段に飛ばした印は付けず、段のまとめは空にして直前に済んだ段をまとめ待ちにする。
 * `workflow_phase` の並びは段の題が起動時に先に振られるので見ない。
 */
function advancedByWorkflowProgress(
  plan: PlannedWorkPlan,
  progress: WorkflowProgress,
): PlannedWorkPlan {
  const entered = Math.max(
    -1,
    ...progress.agents.map((agent) => plan.phaseIds.indexOf(agent.phaseTitle)),
  )
  const phases = plannedPhasesOf(plan)
  const target = phases[entered]
  if (target === undefined || target.entry <= plan.current) {
    return plan
  }
  const lastFinished = phases.findLast((phase) => phase.entry === target.entry - 1)
  return {
    ...plan,
    current: target.entry,
    finishedInGroup: [],
    phaseSummary: "",
    awaitingSummary:
      lastFinished === undefined
        ? NO_AWAITING_SUMMARY
        : { kind: "awaiting", key: lastFinished.key },
  }
}

/**
 * `finished` の `report` 1回で閉じたワークプラン。
 * 残りが1段のときだけ、段の並びはそのままで全部の段を終えた位置にする（最後の段のまとめは最終レポートが担うので持たない）。
 * 段が2つ以上残っている・全部の段を終えた位置では `plan` をそのまま返す。
 */
function closedByReport(plan: PlannedWorkPlan): PlannedWorkPlan {
  return phaseCount(plan.phases) - finishedPhaseCount(plan) === 1
    ? {
        kind: "planned",
        phases: plan.phases,
        phaseIds: plan.phaseIds,
        current: plan.phases.length,
        finishedInGroup: [],
        phaseSummary: "",
        delegatedRange: plan.delegatedRange,
        skippedPhases: plan.skippedPhases,
        awaitingSummary: NO_AWAITING_SUMMARY,
      }
    : plan
}
