// 今のワークプランを動かすイベント列と、流し終えたときの今のワークプランの組（段の名前とまとめはすべて架空のもの）。
// 畳み方そのもの・状態の記録・サーバの差し戻しが、同じ列から同じ今のワークプランに着くかを確かめる表。

import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import type {
  LatestWorkPlan,
  WorkPlan,
  WorkPlanClosing,
  WorkPlanEntry,
} from "../../src/shared/session/work-plan.ts"
import { reportEvent } from "./report-event.ts"

export type WorkPlanScene = {
  readonly name: string
  readonly events: readonly SessionEvent[]
  readonly plan: LatestWorkPlan
}

const SERIAL: readonly WorkPlanEntry[] = [
  "架空の計画",
  "架空の実装A",
  "架空の実装B",
  "架空の受け入れ",
]
const RANGE = { kind: "range", first: 1, count: 2 } as const
const TAIL_RANGE = { kind: "range", first: 2, count: 2 } as const
const PENDING = { kind: "pending", first: 1 } as const
const NO_RANGE = { kind: "none" } as const
const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const TURN_STARTED: SessionEvent = { kind: "turn-started" }
const NONE: LatestWorkPlan = { kind: "none" }

export const WORK_PLAN_SCENES: readonly WorkPlanScene[] = [
  {
    name: "ワークプランが無ければ none",
    events: [REQUEST, returned(1), reported("finished")],
    plan: NONE,
  },
  {
    name: "渡されたワークプランがそのまま今のワークプラン",
    events: [REQUEST, called(planAt(1))],
    plan: plannedAt(1),
  },
  {
    name: "返却で段が進み、要約が段のまとめになる",
    events: [REQUEST, called(planAt(1)), returned(1)],
    plan: plannedAt(2, RANGE, "架空の要約。"),
  },
  {
    name: "返却が続けば、メインが work_plan を呼ばなくても1段ずつ進む",
    events: [REQUEST, called(planAt(1)), returned(1), returned(1), returned(2)],
    plan: plannedAt(3, RANGE, "架空の要約。"),
  },
  {
    name: "一足飛びの返却は動かさない",
    events: [REQUEST, called(planAt(1)), returned(2)],
    plan: plannedAt(1),
  },
  {
    name: "pending のワークプランは返却で動かさない",
    events: [REQUEST, called(planAt(0, PENDING)), returned(1)],
    plan: plannedAt(0, PENDING),
  },
  {
    name: "N の食い違う返却は動かさない",
    events: [REQUEST, called(planAt(1)), returned(1, 3)],
    plan: plannedAt(1),
  },
  {
    name: "範囲の無いワークプランは返却で動かさない",
    events: [REQUEST, called(planAt(0, NO_RANGE)), called(planAt(1, NO_RANGE)), returned(1)],
    plan: plannedAt(1, NO_RANGE),
  },
  {
    name: "並びの最後の段は返却では閉じない",
    events: [REQUEST, called(planAt(3, TAIL_RANGE)), returned(2)],
    plan: plannedAt(3, TAIL_RANGE),
  },
  {
    name: "最後の段で finished の report を受けると全部済みになる",
    events: [REQUEST, called(planAt(3)), reported("finished")],
    plan: plannedAt(4),
  },
  {
    name: "stopped の report では閉じない",
    events: [REQUEST, called(planAt(3)), reported("stopped")],
    plan: plannedAt(3),
  },
  {
    name: "段が2つ以上残っていれば finished の report でも閉じない",
    events: [REQUEST, called(planAt(2)), reported("finished")],
    plan: plannedAt(2),
  },
  {
    name: "依頼で前のワークプランを忘れる",
    events: [REQUEST, called(planAt(1)), REQUEST],
    plan: NONE,
  },
  {
    name: "前の依頼のワークプランは返却でも report でも動かさない",
    events: [REQUEST, called(planAt(3)), REQUEST, returned(1), reported("finished")],
    plan: NONE,
  },
  {
    name: "記録を持たないターンの始まりでは忘れない",
    events: [REQUEST, called(planAt(1)), TURN_STARTED, returned(1)],
    plan: plannedAt(2, RANGE, "架空の要約。"),
  },
]

function planAt(
  current: number,
  delegatedRange: WorkPlan["delegatedRange"] = RANGE,
  phaseSummary = current > 0 && current < SERIAL.length ? "架空のまとめ。" : "",
): WorkPlan {
  return {
    phases: SERIAL,
    current,
    finishedInGroup: [],
    phaseSummary,
    delegatedRange,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  }
}

function plannedAt(...args: Parameters<typeof planAt>): LatestWorkPlan {
  return { kind: "planned", ...planAt(...args) }
}

function called(plan: WorkPlan): SessionEvent {
  return { kind: "work-plan", ...plan }
}

function returned(phase: number, count = 2): SessionEvent {
  return {
    kind: "delegate-returned",
    handback: { kind: "phase-done", phase, count, summary: "架空の要約。" },
  }
}

function reported(workPlanClosing: WorkPlanClosing): SessionEvent {
  return reportEvent({ workPlanClosing })
}
