// いまの様子（キャラクターへ依頼に添えて渡す材料）の、いまの値を時計と記録から導く。
// 材料は数と決まった語と札の ID だけで、会話の文面からは何も導かない（依頼の記録から取るのは時刻だけ）。

import { recommendationOrder } from "../../../shared/recommendation/recommendation-order.ts"
import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import type { PlanUsage } from "../../../shared/usage/plan-usage.ts"
import { type AwayBand, awayBandOf, type TimeBand, timeBandOf } from "../../core/time-band.ts"

/** 使用量の枠の種類。 */
export type PlanUsageWindowName = "five-hour" | "seven-day"

/** いまの様子の値。`?:` の材料は、いまは無い。 */
export type PresentScene = {
  readonly timeBand: TimeBand
  /** 続けて働いた時間（時。1 時間で切り捨てて 2 以上）。 */
  readonly workedHours?: number
  readonly doneToday?: number
  /** 最後の依頼とその前の依頼の間の帯。`requestAt` は最後の依頼の時刻で、同じ空きを見分ける。 */
  readonly away?: { readonly band: AwayBand; readonly requestAt: number }
  /** 8 割を超えた枠（超えた枠が無ければ空）。使用量をまだ知らなければ無い。 */
  readonly overUsage?: readonly PlanUsageWindowName[]
  readonly nextTaskId?: string
}

/** 今日終えたタスクの数の読み。 */
export type DoneTodayRead =
  | { readonly kind: "known"; readonly count: number }
  | { readonly kind: "unknown" }

/** 次に着手できるタスクの札。 */
export type NextTask = { readonly kind: "known"; readonly id: string } | { readonly kind: "none" }

/** いまの様子を導く材料。時計と IO は呼ぶ側が読んで渡す。 */
export type PresentSceneInput = {
  /** いまの時刻（エポックミリ秒）。 */
  readonly now: number
  /** いまのローカルの時（0〜23）。 */
  readonly hour: number
  /** 依頼の時刻（エポックミリ秒。昇順）。 */
  readonly requestTimes: readonly number[]
  readonly doneToday?: number
  readonly planUsage?: PlanUsage
  readonly nextTaskId?: string
}

const HOUR_MS = 3_600_000

/** 隣の依頼との間がこれ以上あいたら、続けて働いた時間を数え直す。 */
const WORK_BREAK_MS = 30 * 60_000

/** 続けて働いた時間を渡し始める時。 */
const WORKED_HOURS_FLOOR = 2

/** 前の依頼からの経過を渡す空き。 */
const AWAY_MIN_MS = 12 * HOUR_MS

/** 使用量の帯を渡す使用率（百分率）。これを超えた枠を渡す。 */
const PLAN_USAGE_ALERT_UTILIZATION = 80

/** いまの様子の値を導く。 */
export function presentSceneOf(input: PresentSceneInput): PresentScene {
  return {
    timeBand: timeBandOf(input.hour),
    workedHours: workedHoursOf(input.requestTimes, input.now),
    doneToday: input.doneToday,
    away: awayOf(input.requestTimes),
    overUsage: input.planUsage === undefined ? undefined : overUsageOf(input.planUsage),
    nextTaskId:
      input.nextTaskId !== undefined && isTaskIdWord(input.nextTaskId)
        ? input.nextTaskId
        : undefined,
  }
}

/** 組み直した履歴から、時刻の分かる依頼の時刻だけを昇順に取り出す（文面は読まない）。 */
export function restoredRequestTimes(restored: readonly RestoredEvent[]): readonly number[] {
  return restored
    .flatMap(({ event, time }) =>
      event.kind === "request" && time.kind === "known" ? [time.at] : [],
    )
    .toSorted((left, right) => left - right)
}

/** タスクの一覧から、おすすめの順の先頭の着手できる札。一覧が読めていない・無ければ `none`。 */
export function nextTaskOf(tasks: TaskSummaryResult): NextTask {
  const head = tasks.kind === "known" ? recommendationOrder(tasks.items)[0] : undefined
  return head === undefined ? { kind: "none" } : { kind: "known", id: head.task.id }
}

/** 札の ID として渡せる語か（英数字と `-`・`.`・`_` だけ）。 */
export function isTaskIdWord(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id)
}

function workedHoursOf(requestTimes: readonly number[], now: number): PresentScene["workedHours"] {
  // 最後の空きの直後の依頼が、続いている働きの先頭。空きが無ければ最初の依頼。
  const resumedAt = requestTimes.findLastIndex(
    (at, index) => at - (requestTimes[index - 1] ?? at) >= WORK_BREAK_MS,
  )
  const start = requestTimes[Math.max(resumedAt, 0)]
  if (start === undefined) {
    return undefined
  }
  const hours = Math.floor((now - start) / HOUR_MS)
  return hours >= WORKED_HOURS_FLOOR ? hours : undefined
}

function awayOf(requestTimes: readonly number[]): PresentScene["away"] {
  const last = requestTimes.at(-1)
  const before = requestTimes.at(-2)
  if (last === undefined || before === undefined || last - before < AWAY_MIN_MS) {
    return undefined
  }
  return { band: awayBandOf(last - before), requestAt: last }
}

function overUsageOf(usage: PlanUsage): readonly PlanUsageWindowName[] {
  const windows = [
    ["five-hour", usage.fiveHour.utilization],
    ["seven-day", usage.sevenDay.utilization],
  ] as const
  return windows
    .filter(([, utilization]) => (utilization ?? 0) > PLAN_USAGE_ALERT_UTILIZATION)
    .map(([name]) => name)
}
