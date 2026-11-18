// 進み具合のプログレスバーの下線の区間。ワークプランの要素1つ（並列のフェーズは配列で1つ、範囲が未定のあいだは範囲で1つ）が区間1つになる。
// 区間の並びと位置「今/全体」、読み上げの名前、手順の一覧の行の元になる群の名・並列の札を、ここで組む。

import { groupBy } from "remeda"

import {
  type PhaseNumber,
  phaseNumberOf,
  phaseOrdinalText,
  PHASE_SPAN_NAMES,
  type PhaseSpan,
  plannedPhaseNumber,
} from "../../../../../shared/session/work-plan-phase-number.ts"
import {
  phaseCount,
  type LatestWorkPlan,
  type PlannedPhase,
  plannedPhasesOf,
} from "../../../../../shared/session/work-plan.ts"
import { phaseMarkOf } from "../../../../domain/phase-mark.ts"

/** ワークプランの無いターンの区間の `key`。フェーズが無いので詳細ではなく手順の一覧を開く。 */
export const WHOLE_SEGMENT_KEY = "whole"

export type WorkSegmentState = "done" | "current" | "asking" | "upcoming"

/** 区間の中のフェーズ1つ。手順の一覧の行の元になる。 */
export type WorkSegmentPhase = {
  readonly index: number
  readonly name: string
  /** 済んだフェーズは「✓」（飛ばしたフェーズは「/」）、答え待ちは「?」、ほかは番号。 */
  readonly mark: string
  readonly state: WorkSegmentState
  readonly skipped: boolean
  /** `PlannedPhase.key`。フェーズごとの所要を引く。 */
  readonly recapKey: string
}

/**
 * 下線の区間1つ。`label` は読み上げの名前「フェーズ 2/4 名前（いま）」。
 * `spanName`・`parallelLabel` は手順の一覧の行にだけ使う群の名（群の先頭の区間だけ）と並列の札（並列の区間だけ）。
 */
export type WorkStripSegment = {
  readonly key: string
  readonly state: WorkSegmentState
  readonly label: string
  readonly phases: readonly WorkSegmentPhase[]
  readonly spanName: string
  readonly parallelLabel: string
}

/** 右端の位置「2/4」。完了とワークプランの無いターンでは出さない。 */
export type WorkStripPosition =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

export type WorkSegments = {
  readonly segments: readonly WorkStripSegment[]
  readonly position: WorkStripPosition
}

export type WorkSegmentFlags = {
  /** 今のフェーズで答え待ちが来ているか。 */
  readonly asking: boolean
  /** 依頼が閉じて帯が済んだ姿か。途中で閉じたワークプランでも区間をすべて済みにし、位置を出さない。 */
  readonly finished: boolean
}

const NAME_SEPARATOR = "・"

const NO_POSITION = { kind: "none" } as const satisfies WorkStripPosition

const NAMED = { kind: "named" } as const satisfies PhaseNumber

const STATE_WORDS = {
  done: "済み",
  current: "いま",
  asking: "いま",
  upcoming: "これから",
} as const satisfies Record<WorkSegmentState, string>

/** 済んだ区間の数。ワークプランの要素の数え方で、ワークプランの無いターンは 0。 */
export function doneSegmentCountOf(plan: LatestWorkPlan): number {
  return plan.kind === "planned" ? Math.min(plan.current, plan.phases.length) : 0
}

export function workSegmentsOf(plan: LatestWorkPlan, flags: WorkSegmentFlags): WorkSegments {
  if (plan.kind !== "planned") {
    const state: WorkSegmentState = flags.finished ? "done" : flags.asking ? "asking" : "current"
    return {
      segments: [
        {
          key: WHOLE_SEGMENT_KEY,
          state,
          label: `作業（${STATE_WORDS[state]}）`,
          phases: [],
          spanName: "",
          parallelLabel: "",
        },
      ],
      position: NO_POSITION,
    }
  }
  const entries = Object.values(groupBy(plannedPhasesOf(plan), (phase) => phase.entry))
  const spanOf = (members: readonly PlannedPhase[]): PhaseSpan => {
    const [first] = members
    const number = first === undefined ? NAMED : plannedPhaseNumber(plan, first)
    return number.kind === "numbered" ? number.span : "whole"
  }
  const segments = entries.map((members, position): WorkStripSegment => {
    const phases = members.map((phase): WorkSegmentPhase => {
      const state: WorkSegmentState =
        phase.state === "current" && flags.asking ? "asking" : phase.state
      return {
        index: phase.index,
        name: phase.name,
        mark: state === "asking" ? "?" : phaseMarkOf(plan, phase),
        state,
        skipped: phase.skipped,
        recapKey: phase.key,
      }
    })
    const state: WorkSegmentState = flags.finished ? "done" : segmentStateOf(phases)
    const open = phases.filter((phase) => phase.state !== "done")
    const names = (state === "done" || open.length === 0 ? phases : open).map((phase) => phase.name)
    const span = spanOf(members)
    const previous = entries[position - 1]
    const number =
      phases.length > 1
        ? phaseNumberOf(
            plan.delegatedRange,
            members.map((phase) => phase.index),
            phaseCount(plan.phases),
          )
        : NAMED
    const ordinal = phaseOrdinalText(number)
    return {
      key: `segment-${String(position)}`,
      state,
      label: `フェーズ ${String(position + 1)}/${String(entries.length)} ${names.join(NAME_SEPARATOR)}（${STATE_WORDS[state]}）`,
      phases,
      spanName: previous === undefined || spanOf(previous) !== span ? PHASE_SPAN_NAMES[span] : "",
      parallelLabel: phases.length > 1 ? (ordinal === "" ? "並列" : `並列 ${ordinal}`) : "",
    }
  })
  const currentAt = segments.findIndex(
    (segment) => segment.state === "current" || segment.state === "asking",
  )
  return {
    segments,
    position:
      flags.finished || currentAt < 0
        ? NO_POSITION
        : { kind: "shown", text: `${String(currentAt + 1)}/${String(segments.length)}` },
  }
}

function segmentStateOf(phases: readonly WorkSegmentPhase[]): WorkSegmentState {
  if (phases.some((phase) => phase.state === "asking")) {
    return "asking"
  }
  if (phases.some((phase) => phase.state === "current")) {
    return "current"
  }
  return phases.every((phase) => phase.state === "done") ? "done" : "upcoming"
}
