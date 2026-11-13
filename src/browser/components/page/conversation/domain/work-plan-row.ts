// 紙に描くワークプランの行。段の並び・今の位置・段のまとめ・飛ばした印・依頼の手順から、
// 済んだ・いま・これから・飛ばしたの行を組む。働くあいだの計画と、終わったあとの道筋は同じ行から描く。

import { groupBy, sumBy } from "remeda"

import type { RecordTime } from "../../../../../shared/session/session-record.ts"
import type { TurnStep } from "../../../../../shared/session/turn-step.ts"
import {
  PHASE_SPAN_NAMES,
  phaseNumberOf,
  phaseOrdinalText,
  plannedPhaseNumber,
} from "../../../../../shared/session/work-plan-phase-number.ts"
import {
  phaseCount,
  type PlannedPhase,
  plannedPhasesOf,
  type PlannedWorkPlan,
} from "../../../../../shared/session/work-plan.ts"
import type { MeasuredTime } from "../../../../../shared/utils/elapsed-time.ts"
import { narrateToolUse } from "../../../../domain/tool-narration.ts"
import { toolInputText } from "../../../../domain/tool-summary.ts"
import type { PhaseRecap } from "./phase-recap.ts"

export type WorkPlanRowState = "done" | "current" | "upcoming" | "skipped"

/** 今の段の「いま」の1行。今の段で動いた手順のうち最後のもの。 */
export type WorkPlanLive =
  | { readonly kind: "none" }
  | { readonly kind: "now"; readonly text: string; readonly startedAt: RecordTime }

/**
 * 段の行1つ。`ordinal` は群の名つきの番号「2」「本1」（番号を持たない段は空）、
 * `title` は今の段なら進行形の名前、ほかは名前。`touched` はその段で `Edit`・`Write` が触ったファイルの名前（重ねない・触った順）。
 */
export type WorkPlanRow = {
  readonly key: string
  readonly state: WorkPlanRowState
  readonly ordinal: string
  readonly title: string
  readonly duration: MeasuredTime
  readonly summary: string
  readonly lap: number
  readonly touched: readonly string[]
  readonly live: WorkPlanLive
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

/** 済んだ段を畳み始める段の数。見本の「働く」の4段は畳まず、「長い作業」の12段は畳む。 */
const LONG_PLAN_PHASES = 6

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
  return entries.map((members, position): WorkPlanSlot => {
    const rows = members.map((phase) => rowOf(source, phase))
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

/** 並びの全部の行（並列のフェーズの中の行も読み順に）。 */
export function rowsOfSlot(slot: WorkPlanSlot): readonly WorkPlanRow[] {
  return slot.kind === "phase" ? [slot.row] : slot.rows
}

function rowOf(source: WorkPlanRowSource, phase: PlannedPhase): WorkPlanRow {
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
    touched: state === "upcoming" ? [] : touchedFilesOf(steps),
    live: state === "current" ? liveOf(steps) : NO_LIVE,
  }
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
