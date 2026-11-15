// 開いた依頼の手順の一覧の、フェーズの行。ワークプランの全フェーズを上から1行ずつにし、そのフェーズで始まった手順の群を行の下に付ける。

import type { MeasuredTime } from "../../../../../../../shared/utils/elapsed-time.ts"
import { formatMeasured } from "../../../../../../../shared/utils/elapsed-time.ts"
import type { CurrentWorkStepGroup } from "../../../../../../features/current-work/current-work-step.ts"

type StepsPhaseState = "done" | "current" | "asking" | "upcoming"

/** 行の元になるフェーズ1つ。丸の並びの `WorkStripPhase` と同じ印・状態・飛ばしたかを持つ。 */
export type StepsPhaseSource = {
  readonly index: number
  readonly name: string
  readonly mark: string
  readonly state: StepsPhaseState
  readonly skipped: boolean
  /** そのフェーズの所要。まだ始まっていない・飛ばしたフェーズでは読まれない。 */
  readonly duration: MeasuredTime
}

/** 丸の並びの1つぶん（フェーズ1つ、または並列のフェーズ）。`spanName` は群の先頭だけ「前」「本」「後」、`parallelLabel` は並列のときだけ「並列 …」。 */
export type StepsPhaseSlotSource = {
  readonly spanName: string
  readonly parallelLabel: string
  readonly phases: readonly StepsPhaseSource[]
}

/**
 * フェーズの行1つ。`groups` はそのフェーズで始まった手順の群（小見出しは行が持つので外してある）、
 * `stepCount` は群の手順の数、`open` は手順を開いて出すか（今のフェーズと失敗した手順を含むフェーズ）。
 * `spanName`・`parallelLabel` は群の先頭・並列の先頭の行だけが持ち、ほかは空。
 */
export type StepsPhaseRow = {
  readonly key: string
  readonly phaseIndex: number
  readonly name: string
  readonly mark: string
  readonly state: StepsPhaseState
  readonly skipped: boolean
  readonly spanName: string
  readonly parallelLabel: string
  /** 「1分40秒」「20秒〜」。まだのフェーズ・飛ばしたフェーズ・測れなかったときは空。 */
  readonly duration: string
  readonly groups: readonly CurrentWorkStepGroup[]
  readonly stepCount: number
  readonly open: boolean
}

export type StepsPhaseRows = {
  readonly rows: readonly StepsPhaseRow[]
  /** どの行にも付かない群（ワークプランの前・全フェーズを終えたあとの手順、ワークプランの無い依頼のすべて）。 */
  readonly rest: readonly CurrentWorkStepGroup[]
}

export function stepsPhaseRowsOf(
  slots: readonly StepsPhaseSlotSource[],
  groups: readonly CurrentWorkStepGroup[],
): StepsPhaseRows {
  const claimed = new Set<string>()
  const rows = slots.flatMap((slot) =>
    slot.phases.map((phase, position): StepsPhaseRow => {
      const owned = groups.filter(
        (group) =>
          !claimed.has(group.key) &&
          group.heading.kind === "phase" &&
          group.heading.phaseIndexes.includes(phase.index),
      )
      for (const group of owned) {
        claimed.add(group.key)
      }
      const bare = owned.map((group): CurrentWorkStepGroup => ({ ...group, heading: NO_HEADING }))
      return {
        key: `phase-${String(phase.index)}`,
        phaseIndex: phase.index,
        name: phase.name,
        mark: phase.mark,
        state: phase.state,
        skipped: phase.skipped,
        spanName: position === 0 ? slot.spanName : "",
        parallelLabel: position === 0 ? slot.parallelLabel : "",
        duration: durationTextOf(phase),
        groups: bare,
        stepCount: bare.reduce((sum, group) => sum + group.steps.length, 0),
        open:
          phase.state === "current" ||
          phase.state === "asking" ||
          bare.some((group) => group.steps.some((step) => step.failure.kind === "failed")),
      }
    }),
  )
  return { rows, rest: groups.filter((group) => !claimed.has(group.key)) }
}

const NO_HEADING = { kind: "none" } as const satisfies CurrentWorkStepGroup["heading"]

function durationTextOf(phase: StepsPhaseSource): string {
  if (phase.skipped || phase.state === "upcoming" || phase.duration.kind !== "known") {
    return ""
  }
  const text = formatMeasured(phase.duration)
  return phase.state === "done" ? text : `${text}〜`
}
