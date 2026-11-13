// 紙に描くワークプランの行。段の並び・今の位置・段のまとめ・飛ばした印・依頼の手順から、
// 済んだ・いま・これから・飛ばしたの行を組む。働くあいだの計画と、終わったあとの道筋は同じ行から描く。

import { groupBy, sumBy } from "remeda"

import type { StampedPendingAsk } from "../../../../../shared/session-driver/pending-ask.ts"
import type { DelegateRole } from "../../../../../shared/session/delegate-role.ts"
import { type RecordTime, recordTimeAt } from "../../../../../shared/session/session-record.ts"
import type { TurnStep } from "../../../../../shared/session/turn-step.ts"
import {
  PHASE_SPAN_NAMES,
  phaseNumberOf,
  phaseOrdinalText,
  phaseSpanOf,
  plannedPhaseNumber,
} from "../../../../../shared/session/work-plan-phase-number.ts"
import {
  phaseCount,
  type PlannedPhase,
  plannedPhasesOf,
  type PlannedWorkPlan,
} from "../../../../../shared/session/work-plan.ts"
import type { UsualDurations } from "../../../../../shared/usage/usual-duration.ts"
import { clipWithEllipsis } from "../../../../../shared/utils/clip-text.ts"
import type { MeasuredTime } from "../../../../../shared/utils/elapsed-time.ts"
import { narrateToolUse } from "../../../../domain/tool-narration.ts"
import { MAX_TOOL_SUMMARY_LENGTH, toolInputText } from "../../../../domain/tool-summary.ts"
import type { PhaseRecap } from "./phase-recap.ts"
import { NO_USUAL_TEXT, type UsualText, usualRangeText } from "./usual-duration.ts"
import { askOf, NO_ASK, type WorkPlanAsk } from "./work-plan-ask-row.ts"

export type WorkPlanRowState = "done" | "current" | "upcoming" | "skipped" | "failed"

/** 今の段の「いま」の1行。今の段で動いた手順のうち最後のもの。 */
export type WorkPlanLive =
  | { readonly kind: "none" }
  | { readonly kind: "now"; readonly text: string; readonly startedAt: RecordTime }

/**
 * 段の中の周の行1つ。差し戻された周（`label` は「n周目」、`text` は差し戻しの理由）と、そのあとの直し（`label` は「直し」）が交互に並ぶ。
 * 最後の直しは、段が今なら `now`、ほかは `fixed`。直しの `text` は空（tsukumo は直しの文言を作らない）。
 */
export type WorkPlanLap = {
  readonly key: string
  readonly label: string
  readonly result: "rejected" | "fixed" | "now"
  readonly text: string
  readonly duration: MeasuredTime
}

/**
 * 「任せた」の行1つ。`name` は役の名前（委譲の説明）、`text` は進みの最新の1行を1行の長さで切ったもの（まだ無ければ空）、
 * `since` は役が最後に動いた時刻。
 */
export type WorkPlanDelegate = {
  readonly key: string
  readonly name: string
  readonly state: DelegateRole["state"]
  readonly text: string
  readonly since: RecordTime
}

/**
 * 段の行1つ。`ordinal` は群の名つきの番号「2」「本1」（番号を持たない段は空）、
 * `title` は今の段なら進行形の名前、ほかは名前。`touched` はその段で `Edit`・`Write` が触ったファイルの名前（重ねない・触った順）。
 * `laps` は周の行（{@link WorkPlanLap}）で、周が進んでいない段とこれからの段は空。
 * `delegates` は任せた役の行で、今の段のうち読み順で最初の行だけが持つ（ほかは空）。
 * `usual` はこれからの段にだけ付く「似た作業では 2〜4分」（{@link usualRangeText}）。
 */
export type WorkPlanRow = {
  readonly key: string
  readonly state: WorkPlanRowState
  readonly ordinal: string
  readonly title: string
  readonly duration: MeasuredTime
  readonly summary: string
  readonly lap: number
  readonly laps: readonly WorkPlanLap[]
  readonly delegates: readonly WorkPlanDelegate[]
  readonly touched: readonly string[]
  readonly live: WorkPlanLive
  readonly usual: UsualText
  /** 答え待ちの問い。今の段のうち読み順で最初の行だけが持つ（ほかは `none`）。 */
  readonly ask: WorkPlanAsk
}

/** 群の先頭の行に付ける群の名「前」「本」「後」。群の先頭でない・範囲が無いなら `none`。 */
export type WorkPlanSpanHead =
  | { readonly kind: "none" }
  | { readonly kind: "head"; readonly name: string }

/** 並びの1要素。並列のフェーズは中の段の行を `rows` に並べる。 */
export type WorkPlanSlot =
  | { readonly kind: "phase"; readonly spanHead: WorkPlanSpanHead; readonly row: WorkPlanRow }
  | {
      readonly kind: "parallel"
      readonly spanHead: WorkPlanSpanHead
      readonly key: string
      readonly label: string
      readonly rows: readonly WorkPlanRow[]
    }

export type WorkPlanRowSource = {
  readonly plan: PlannedWorkPlan
  /** {@link PhaseRecap} を `PlannedPhase.key` で引く。 */
  readonly recaps: ReadonlyMap<string, PhaseRecap>
  readonly steps: readonly TurnStep[]
  readonly delegates: readonly DelegateRole[]
  readonly usual: UsualDurations
  readonly asks: readonly StampedPendingAsk[]
}

/**
 * 済んだ段を1行に畳んだ並び。段の数が {@link LONG_PLAN_PHASES} を超え、済んだ要素が2つ以上あるときだけ畳む。
 * `count` は畳んだ段の数、`duration` は畳んだ段の所要の和（1つでも測れなければ `unknown`）、`touched` は触ったファイルの数。
 */
export type FoldedWorkPlan = {
  readonly folded:
    | { readonly kind: "none" }
    | {
        readonly kind: "folded"
        readonly count: number
        readonly duration: MeasuredTime
        readonly touched: number
        readonly rows: readonly WorkPlanRow[]
      }
  readonly slots: readonly WorkPlanSlot[]
}

/**
 * 前の周を1行に畳んだ周の行。周が {@link FOLD_LAPS_FROM} に達したときだけ、いまの周と1つ前の周を残して畳む。
 * `count` は畳んだ差し戻しの数、`laps` は畳んだ周の行（開くと読める）。
 */
export type FoldedLaps = {
  readonly folded:
    | { readonly kind: "none" }
    | { readonly kind: "folded"; readonly count: number; readonly laps: readonly WorkPlanLap[] }
  readonly laps: readonly WorkPlanLap[]
}

/**
 * 済んだ役を1行に畳んだ「任せた」の行。役が {@link FOLD_DELEGATES_FROM} 以上で済んだ役があるときだけ、済んだ役を畳む。
 * 動いている役はいくつあっても畳まない。
 */
export type FoldedDelegates = {
  readonly folded:
    | { readonly kind: "none" }
    | { readonly kind: "folded"; readonly delegates: readonly WorkPlanDelegate[] }
  readonly delegates: readonly WorkPlanDelegate[]
}

/** 済んだ段を畳み始める段の数。見本の「働く」の4段は畳まず、「長い作業」の12段は畳む。 */
const LONG_PLAN_PHASES = 6

/** 前の周を畳み始める周の数（4周目に入ったら畳む）。 */
const FOLD_LAPS_FROM = 4

/** 畳まずに残す周の数（いまの周と1つ前の周）。周は差し戻しと直しの2行。 */
const KEPT_LAPS = 2

const LAP_ROWS = 2

/** 済んだ役を畳み始める役の数。 */
const FOLD_DELEGATES_FROM = 6

const FIX_LABEL = "直し"

const FILE_WRITING_TOOLS: ReadonlySet<string> = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
])

const PARALLEL_LABEL = "並列"

const NO_SPAN_HEAD = { kind: "none" } as const satisfies WorkPlanSpanHead

const NO_LIVE = { kind: "none" } as const satisfies WorkPlanLive

const UNKNOWN_TIME = { kind: "unknown" } as const satisfies MeasuredTime

export function workPlanSlotsOf(source: WorkPlanRowSource): readonly WorkPlanSlot[] {
  const { plan } = source
  const planned = plannedPhasesOf(plan)
  const entries = Object.values(groupBy(planned, (phase) => phase.entry))
  const spanOf = (members: readonly PlannedPhase[]): string => {
    const [first] = members
    if (first === undefined) {
      return ""
    }
    const number = plannedPhaseNumber(plan, first)
    return number.kind === "numbered" ? PHASE_SPAN_NAMES[number.span] : ""
  }
  const firstCurrent = planned.find((phase) => phase.state === "current")?.key
  return entries.map((members, position): WorkPlanSlot => {
    const rows = members.map((phase) => rowOf(source, phase, phase.key === firstCurrent))
    const span = spanOf(members)
    const previous = entries[position - 1]
    const spanHead: WorkPlanSpanHead =
      span !== "" && (previous === undefined || spanOf(previous) !== span)
        ? { kind: "head", name: span }
        : NO_SPAN_HEAD
    const [first] = rows
    if (rows.length === 1 && first !== undefined) {
      return { kind: "phase", spanHead, row: first }
    }
    const ordinal = phaseOrdinalText(
      phaseNumberOf(
        plan.delegatedRange,
        members.map((phase) => phase.index),
        phaseCount(plan.phases),
      ),
    )
    return {
      kind: "parallel",
      spanHead,
      key: `group-${String(members[0]?.entry ?? position)}`,
      label: ordinal === "" ? PARALLEL_LABEL : `${PARALLEL_LABEL} ${ordinal}`,
      rows,
    }
  })
}

/** 長い並びの済んだ要素を先頭から1行に畳む（{@link FoldedWorkPlan}）。 */
export function foldWorkPlanSlots(slots: readonly WorkPlanSlot[]): FoldedWorkPlan {
  const rows = slots.flatMap(rowsOfSlot)
  const doneCount = slots.findIndex((slot) => !rowsOfSlot(slot).every(isSettled))
  const settled = doneCount === -1 ? slots.length : doneCount
  if (rows.length <= LONG_PLAN_PHASES || settled < 2) {
    return { folded: { kind: "none" }, slots }
  }
  const foldedRows = slots.slice(0, settled).flatMap(rowsOfSlot)
  return {
    folded: {
      kind: "folded",
      count: foldedRows.length,
      duration: totalDuration(foldedRows),
      touched: new Set(foldedRows.flatMap((row) => row.touched)).size,
      rows: foldedRows,
    },
    slots: slots.slice(settled),
  }
}

/** 周の行を畳む（{@link FoldedLaps}）。周の数は差し戻しの数に1を足したもの。 */
export function foldLaps(laps: readonly WorkPlanLap[]): FoldedLaps {
  const rejected = laps.filter((lap) => lap.result === "rejected").length
  if (rejected + 1 < FOLD_LAPS_FROM) {
    return { folded: { kind: "none" }, laps }
  }
  const kept = laps.length - KEPT_LAPS * LAP_ROWS
  return {
    folded: { kind: "folded", count: kept / LAP_ROWS, laps: laps.slice(0, kept) },
    laps: laps.slice(kept),
  }
}

/** 「任せた」の行を畳む（{@link FoldedDelegates}）。動いている役を上に、済んだ役を下に並べる。 */
export function foldDelegates(delegates: readonly WorkPlanDelegate[]): FoldedDelegates {
  const running = delegates.filter((delegate) => delegate.state === "running")
  const done = delegates.filter((delegate) => delegate.state === "done")
  return delegates.length < FOLD_DELEGATES_FROM || done.length === 0
    ? { folded: { kind: "none" }, delegates: [...running, ...done] }
    : { folded: { kind: "folded", delegates: done }, delegates: running }
}

/** 並びの全部の行（並列のフェーズの中の行も読み順に）。 */
export function rowsOfSlot(slot: WorkPlanSlot): readonly WorkPlanRow[] {
  return slot.kind === "phase" ? [slot.row] : slot.rows
}

function rowOf(
  source: WorkPlanRowSource,
  phase: PlannedPhase,
  holdsDelegates: boolean,
): WorkPlanRow {
  const recap = source.recaps.get(phase.key)
  const state: WorkPlanRowState = phase.skipped ? "skipped" : phase.state
  const steps = source.steps.filter(
    (step) => step.phase.kind === "phase" && step.phase.indexes.includes(phase.index),
  )
  const number = plannedPhaseNumber(source.plan, phase)
  return {
    key: phase.key,
    state,
    ordinal: phaseOrdinalText(number),
    title: state === "current" ? phase.doing : phase.name,
    duration: state === "upcoming" ? UNKNOWN_TIME : (recap?.duration ?? UNKNOWN_TIME),
    summary: state === "done" || state === "skipped" ? (recap?.summary ?? "") : "",
    lap: phase.lap,
    laps: state === "upcoming" || recap === undefined ? [] : lapsOf(recap, state),
    delegates: holdsDelegates ? source.delegates.map(delegateOf) : [],
    touched: state === "upcoming" ? [] : touchedFilesOf(steps),
    live: state === "current" ? liveOf(steps) : NO_LIVE,
    usual:
      state === "upcoming"
        ? usualRangeText(source.usual.phases[phaseSpanOf(source.plan, phase)])
        : NO_USUAL_TEXT,
    ask: holdsDelegates ? askOf(source.asks) : NO_ASK,
  }
}

/**
 * 差し戻された周ごとに「n周目」と「直し」の2行。周の所要は周の始まりから差し戻しまで。
 * 途中の直しは次の周と区切る記録が無いので所要を持たず、最後の直しは段の所要から最後の差し戻しまでの分を引いたもの。
 */
function lapsOf(recap: PhaseRecap, state: WorkPlanRowState): readonly WorkPlanLap[] {
  const { laps } = recap
  return laps.flatMap((entry, index): readonly WorkPlanLap[] => {
    const isLast = index === laps.length - 1
    return [
      {
        key: `${String(entry.lap)}-rejected`,
        label: `${String(entry.lap)}周目`,
        result: "rejected",
        text: entry.reason,
        duration: timeBetween(entry.startedAt, entry.rejectedAt),
      },
      {
        key: `${String(entry.lap)}-fixed`,
        label: FIX_LABEL,
        result: isLast && state === "current" ? "now" : "fixed",
        text: "",
        duration: isLast ? lastFixDuration(recap) : UNKNOWN_TIME,
      },
    ]
  })
}

function delegateOf(role: DelegateRole): WorkPlanDelegate {
  return {
    key: role.taskId,
    name: role.name,
    state: role.state,
    text: clipWithEllipsis(
      role.summary.replaceAll(/\s*[\r\n]+\s*/gu, " "),
      MAX_TOOL_SUMMARY_LENGTH,
    ),
    since: { kind: "stamped", at: role.at },
  }
}

function lastFixDuration({ duration, laps }: PhaseRecap): MeasuredTime {
  const [first] = laps
  const last = laps.at(-1)
  if (duration.kind !== "known" || first === undefined || last === undefined) {
    return UNKNOWN_TIME
  }
  const before = timeBetween(first.startedAt, last.rejectedAt)
  return before.kind === "known" && before.milliseconds <= duration.milliseconds
    ? { kind: "known", milliseconds: duration.milliseconds - before.milliseconds }
    : UNKNOWN_TIME
}

function timeBetween(start: RecordTime, end: RecordTime): MeasuredTime {
  const startAt = recordTimeAt(start)
  const endAt = recordTimeAt(end)
  return startAt === undefined || endAt === undefined || endAt < startAt
    ? UNKNOWN_TIME
    : { kind: "known", milliseconds: endAt - startAt }
}

function touchedFilesOf(steps: readonly TurnStep[]): readonly string[] {
  const names = steps.flatMap((step) => {
    if (!FILE_WRITING_TOOLS.has(step.name) || step.status.kind === "failed") {
      return []
    }
    const path = toolInputText(step.name, step.input)
    const name = path.split(/[\\/]/u).findLast((part) => part !== "")
    return name === undefined ? [] : [name]
  })
  return [...new Set(names)]
}

function liveOf(steps: readonly TurnStep[]): WorkPlanLive {
  const last = steps.at(-1)
  if (last === undefined) {
    return NO_LIVE
  }
  return {
    kind: "now",
    text: narrateToolUse(last.name, last.input) ?? last.name,
    startedAt: last.startedAt,
  }
}

function isSettled(row: WorkPlanRow): boolean {
  return row.state === "done" || row.state === "skipped"
}

function totalDuration(rows: readonly WorkPlanRow[]): MeasuredTime {
  const known = rows.flatMap((row) => (row.duration.kind === "known" ? [row.duration] : []))
  return known.length === rows.length
    ? { kind: "known", milliseconds: sumBy(known, (time) => time.milliseconds) }
    : UNKNOWN_TIME
}
