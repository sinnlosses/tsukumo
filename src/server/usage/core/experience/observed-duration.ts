// 見込みと「いつもは」の幅の材料にする所要（済んだ段1つ・終わった道具1回）を、イベント1件から拾う決まり。
//
// 段は群だけ、道具は待ちの種類だけを持ち出す。段の名前・道具の名前と引数は行に通さない。

import { phaseDurationOf } from "../../../../shared/session/phase-duration.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { recordTimeAt, type SessionRecord } from "../../../../shared/session/session-record.ts"
import type { SessionState } from "../../../../shared/session/session-state.ts"
import { toolRecordDuration } from "../../../../shared/session/turn-step.ts"
import { type PhaseSpan, phaseSpanOf } from "../../../../shared/session/work-plan-phase-number.ts"
import {
  advanceWorkPlanTrail,
  EMPTY_WORK_PLAN_TRAIL,
  type WorkPlanTrail,
} from "../../../../shared/session/work-plan-trail.ts"
import { plannedPhasesOf } from "../../../../shared/session/work-plan.ts"
import { type WaitKind, waitKindOfTool } from "../../../../shared/usage/experience-metric-record.ts"

/** ワークプランの段が1つ済んだ。段の名前は持たず、群だけを持つ。 */
export type PhaseEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "phase"
  readonly span: PhaseSpan
  readonly phaseSeconds: number
}

/** 道具1回が終わった。道具の名前と引数は持たず、待ちの種類だけを持つ。 */
export type WaitEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "wait"
  readonly waitKind: WaitKind
  readonly waitSeconds: number
}

type ToolRecord = Extract<SessionRecord, { readonly kind: "tool" }>

/**
 * イベント1件で済んだ段と終わった道具の所要。`state` は畳んだあとの姿。
 * セッションIDが分からないうち・所要が測れないものは書かない。
 */
export function observedDurations(
  event: SessionEvent,
  state: SessionState,
  at: number,
): readonly (PhaseEntry | WaitEntry)[] {
  if (state.session.kind === "starting") {
    return []
  }
  const sessionId = state.session.sessionId
  switch (event.kind) {
    case "work-plan":
      return finishedPhases(state.records).map(({ span, seconds }) => ({
        at,
        sessionId,
        kind: "phase",
        span,
        phaseSeconds: seconds,
      }))
    case "tool-finished":
    case "background-tool-finished": {
      const tool = state.records.find(
        (record): record is ToolRecord =>
          record.kind === "tool" && record.toolUseId === event.toolUseId,
      )
      if (tool === undefined) {
        return []
      }
      return finishedToolSeconds(tool, event.kind, at).map((seconds) => ({
        at,
        sessionId,
        kind: "wait",
        waitKind: waitKindOfTool(tool.name),
        waitSeconds: seconds,
      }))
    }
    default:
      return []
  }
}

/** 最後の `work-plan` の記録で今の段から済んだ段に移った段（飛ばした段を除く）の群と秒数。 */
function finishedPhases(
  records: readonly SessionRecord[],
): readonly { readonly span: PhaseEntry["span"]; readonly seconds: number }[] {
  const trail = records.reduce<WorkPlanTrail>(advanceWorkPlanTrail, EMPTY_WORK_PLAN_TRAIL)
  const latest = trail.plans.at(-1)
  const previous = trail.plans.at(-2) ?? trail.carried.at(-1)?.plans.at(-1)
  if (latest === undefined || previous === undefined) {
    return []
  }
  const wasCurrent = new Set(
    plannedPhasesOf(previous)
      .filter((phase) => phase.state === "current")
      .map((phase) => phase.key),
  )
  const durationOf = phaseDurationOf(trail, latest.time)
  return plannedPhasesOf(latest).flatMap((phase) => {
    if (phase.state !== "done" || phase.skipped || !wasCurrent.has(phase.key)) {
      return []
    }
    const duration = durationOf(phase.key)
    return duration.kind === "known"
      ? [{ span: phaseSpanOf(latest, phase), seconds: duration.milliseconds / 1000 }]
      : []
  })
}

/**
 * 終わった道具の秒数（このイベントで終わっていなければ空）。サブエージェントの中の道具は数えない。
 * 背景で走らせた道具は、結果（すぐに返る）ではなく完了の知らせで数え、2回目の知らせでは数えない。
 */
function finishedToolSeconds(
  tool: ToolRecord,
  kind: "tool-finished" | "background-tool-finished",
  at: number,
): readonly number[] {
  const endsHere =
    kind === "tool-finished"
      ? tool.backgroundEnd.kind === "foreground"
      : tool.backgroundEnd.kind === "notified" && recordTimeAt(tool.backgroundEnd.at) === at
  const duration = toolRecordDuration(tool)
  return !tool.nested && endsHere && duration.kind === "known" ? [duration.milliseconds / 1000] : []
}
