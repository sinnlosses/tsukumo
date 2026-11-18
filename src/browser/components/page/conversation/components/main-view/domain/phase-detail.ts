// 進み具合のプログレスバーの下線の区間を押すと重なって出る、フェーズの詳細の中身を組む決まり。
// 済んだフェーズはまとめと手順、今のフェーズは走っている手順と直前の手順、まだのフェーズは名前と一言。

import {
  type PhaseNumber,
  PHASE_SPAN_NAMES,
  phaseNumberOf,
} from "../../../../../../../shared/session/work-plan-phase-number.ts"
import type { DelegatedRange } from "../../../../../../../shared/session/work-plan.ts"
import type { CurrentWorkStepGroup } from "../../../../../../features/current-work/current-work-step.ts"
import type { PhaseRecap } from "../../../domain/phase-recap.ts"
import type { WorkSegmentState, WorkStripSegment } from "../../../domain/work-segment.ts"
import type { StepsPhaseRow } from "./steps-phase-row.ts"

/** 今のフェーズの詳細に出す、走っている手順と直前の手順の数。 */
const RECENT_STEP_COUNT = 2

const NAME_SEPARATOR = "・"

const STATE_WORDS = {
  done: "済み",
  current: "いま",
  asking: "答え待ち",
  upcoming: "これから",
} as const satisfies Record<WorkSegmentState, string>

const NEXT_NOTE = "今のフェーズが済んだら始めます。"

const LATER_NOTE = "まだ始めていません。"

/** フェーズの詳細の中身。出さない欄は空の文字列・空の配列。 */
export type PhaseDetail = {
  readonly state: WorkSegmentState
  readonly name: string
  /** 頭の右の字「2/4 · 済み · 48秒」。まだのフェーズは所要を付けない。 */
  readonly meta: string
  /** 委譲の範囲の中のフェーズだけ、群の番号「本 2」。 */
  readonly number: string
  readonly summary: string
  readonly groups: readonly CurrentWorkStepGroup[]
  /** まだのフェーズの一言。 */
  readonly note: string
}

export type PhaseDetailSource = {
  /** 押した区間と、並びの中の位置（0 始まり）・区間の数・1つ前の区間の状態（先頭は無し）。 */
  readonly segment: WorkStripSegment
  readonly index: number
  readonly count: number
  readonly previousState: WorkSegmentState | "none"
  readonly delegatedRange: DelegatedRange
  /** 平らにしたフェーズの数。 */
  readonly phaseTotal: number
  readonly recaps: ReadonlyMap<string, PhaseRecap>
  /** 手順の一覧の行。区間のフェーズで始まった手順の群を取る。 */
  readonly rows: readonly StepsPhaseRow[]
}

export function phaseDetailOf(source: PhaseDetailSource): PhaseDetail {
  const { segment } = source
  const { state } = segment
  const rows = source.rows.filter((row) =>
    segment.phases.some((phase) => phase.index === row.phaseIndex),
  )
  const duration = rows.map((row) => row.duration).find((text) => text !== "") ?? ""
  const position = `${String(source.index + 1)}/${String(source.count)}`
  const words = [position, STATE_WORDS[state]]
  const meta = (state === "upcoming" || duration === "" ? words : [...words, duration]).join(" · ")
  const summary =
    state === "done"
      ? (segment.phases
          .map((phase) => source.recaps.get(phase.recapKey)?.summary ?? "")
          .find((text) => text !== "") ?? "")
      : ""
  const groups = rows.flatMap((row) => row.groups)
  return {
    state,
    name: segment.phases.map((phase) => phase.name).join(NAME_SEPARATOR),
    meta,
    number: numberTextOf(
      phaseNumberOf(
        source.delegatedRange,
        segment.phases.map((phase) => phase.index),
        source.phaseTotal,
      ),
    ),
    summary,
    groups: stepsShownOf(state, groups),
    note: noteOf(state, source.previousState),
  }
}

/** 群の並びの末尾から `count` 手順だけを残す。手順が残らない群は外す。 */
export function lastStepsOf(
  groups: readonly CurrentWorkStepGroup[],
  count: number,
): readonly CurrentWorkStepGroup[] {
  let left = count
  const kept: CurrentWorkStepGroup[] = []
  for (const group of groups.toReversed()) {
    if (left === 0) {
      break
    }
    const steps = group.steps.slice(-left)
    left -= steps.length
    if (steps.length > 0) {
      kept.unshift({ ...group, steps })
    }
  }
  return kept
}

function numberTextOf(number: PhaseNumber): string {
  return number.kind === "numbered" && number.span === "delegated"
    ? `${PHASE_SPAN_NAMES.delegated} ${number.ordinals}`
    : ""
}

function stepsShownOf(
  state: WorkSegmentState,
  groups: readonly CurrentWorkStepGroup[],
): readonly CurrentWorkStepGroup[] {
  if (state === "done") {
    return groups
  }
  if (state === "upcoming") {
    return []
  }
  return lastStepsOf(groups, RECENT_STEP_COUNT)
}

function noteOf(state: WorkSegmentState, previousState: WorkSegmentState | "none"): string {
  if (state !== "upcoming") {
    return ""
  }
  return previousState === "upcoming" ? LATER_NOTE : NEXT_NOTE
}
