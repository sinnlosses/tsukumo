// 進み具合のプログレスバーの「手順」で開く全体の詳細の中身を組む。開いているときだけ、行と手順の群を組む。

import type { PhaseTimesView } from "../../../../../../../shared/report/report-phase-time.ts"
import type { BackgroundTask } from "../../../../../../../shared/session-driver/background-task.ts"
import type { TurnStep } from "../../../../../../../shared/session/turn-step.ts"
import {
  currentWorkStepGroups,
  toBackgroundListView,
  type CurrentWorkBackgroundList,
  type CurrentWorkStepGroup,
} from "../../../../../../features/current-work/current-work-step.ts"
import type { PhaseRecap } from "../../../domain/phase-recap.ts"
import type { WorkStripSegment } from "../../../domain/work-segment.ts"
import type { StepsLanding } from "../../../stores/work-strip-step-list.ts"
import type { RemainingEstimate } from "../domain/remaining-estimate.ts"
import { phaseRowSlotOf, stepsPhaseRowsOf } from "../domain/steps-phase-row.ts"
import { type StepsPlanItem, stepsPlanCardOf } from "../domain/steps-plan-card.ts"

/** 全体の詳細が開いているか。`landing` は開いた面をどこへ連れていくか。 */
export type WorkStripStepsList =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly landing: StepsLanding
      readonly doneExpanded: boolean
      readonly stepsExpanded: boolean
    }

/** 「手順」の口と、押すと重なって開く依頼の全体の詳細。 */
export type WorkStripSteps = {
  readonly list: WorkStripStepsList
  readonly onToggle: () => void
  readonly onExpandDone: () => void
  readonly onExpandSteps: () => void
  /** 「4 フェーズ」。ワークプランが無ければ空。 */
  readonly phaseCountLabel: string
  /** 並べる項目（済んだ n フェーズの畳み・フェーズの行・ほか n フェーズ）。 */
  readonly card: readonly StepsPlanItem[]
  /** どの行にも付かない手順の群。 */
  readonly rest: readonly CurrentWorkStepGroup[]
  /** 済んだ姿のときだけ末尾に出す、最終レポートの段ごとの所要時間。作業中は `none`。 */
  readonly phaseTimes: PhaseTimesView
  /** 実行中の手順と依頼の手順の間に出す「バックグラウンドタスク」の区画。 */
  readonly backgroundList: CurrentWorkBackgroundList
  /** 下端の依頼全体の経過（作業中は「経過 …」、閉じたあとは「所要 …」）。 */
  readonly footLabel: string
  /** 下端の経過の右に添える目安の残り。出さないときは `none`。 */
  readonly estimate: RemainingEstimate
}

export function workStripStepsOf(input: {
  readonly estimate: RemainingEstimate
  readonly list: WorkStripStepsList
  readonly steps: readonly TurnStep[]
  readonly segments: readonly WorkStripSegment[]
  readonly recaps: ReadonlyMap<string, PhaseRecap>
  readonly finished: boolean
  readonly phaseTimes: PhaseTimesView
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly footLabel: string
  readonly onToggle: () => void
  readonly onExpandDone: () => void
  readonly onExpandSteps: () => void
}): WorkStripSteps {
  const { list } = input
  const planRows =
    list.kind === "open"
      ? stepsPhaseRowsOf(
          input.segments.map((segment) => phaseRowSlotOf(segment, input.recaps)),
          currentWorkStepGroups(input.steps),
        )
      : { rows: [], rest: [] }
  return {
    list,
    onToggle: input.onToggle,
    onExpandDone: input.onExpandDone,
    onExpandSteps: input.onExpandSteps,
    phaseCountLabel: planRows.rows.length === 0 ? "" : `${String(planRows.rows.length)} フェーズ`,
    card:
      list.kind === "open"
        ? stepsPlanCardOf({
            rows: planRows.rows,
            finished: input.finished,
            landing: list.landing,
            doneExpanded: list.doneExpanded,
            stepsExpanded: list.stepsExpanded,
          })
        : [],
    rest: planRows.rest,
    phaseTimes: input.phaseTimes,
    backgroundList: toBackgroundListView(input.backgroundTasks),
    footLabel: input.footLabel,
    estimate: input.estimate,
  }
}
