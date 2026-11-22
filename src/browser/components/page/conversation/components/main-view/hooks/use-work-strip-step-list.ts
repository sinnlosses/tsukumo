// 進み具合のプログレスバーの「手順」で開く全体の詳細の中身を組む。開いているときだけ、行と手順の群を組む。

import { omit } from "remeda"

import type { PhaseTimesView } from "../../../../../../../shared/report/report-phase-time.ts"
import type { BackgroundTask } from "../../../../../../../shared/session-driver/background-task.ts"
import type { TaskId } from "../../../../../../../shared/session-driver/task-id.ts"
import type { TurnStep } from "../../../../../../../shared/session/turn-step.ts"
import type { WorkflowRun } from "../../../../../../../shared/session/workflow-run.ts"
import { formatMeasured } from "../../../../../../../shared/utils/elapsed-time.ts"
import {
  currentWorkStepGroups,
  toBackgroundListView,
  type CurrentWorkBackgroundList,
  type CurrentWorkStepGroup,
} from "../../../../../../features/current-work/current-work-step.ts"
import type { PhaseRecap } from "../../../domain/phase-recap.ts"
import type { WorkStripSegment } from "../../../domain/work-segment.ts"
import type { SelectedWorkflowAgent, StepsLanding } from "../../../stores/work-strip-step-list.ts"
import type { RemainingEstimate } from "../domain/remaining-estimate.ts"
import { phaseRowSlotOf, type StepsPhaseRow, stepsPhaseRowsOf } from "../domain/steps-phase-row.ts"
import { type StepsPlanItem, stepsPlanCardOf } from "../domain/steps-plan-card.ts"
import { type WorkflowAgentHand, workflowHandOf } from "../domain/workflow-agent-hand.ts"
import {
  type WorkflowAgentCount,
  workflowAgentCountsOf,
  workflowRunElapsedOf,
} from "../domain/workflow-diagram-view.ts"
import {
  type WorkflowDiagram,
  workflowBoxStateOf,
  workflowDiagramOf,
} from "../domain/workflow-diagram.ts"

/** 全体の詳細が開いているか。`landing` は開いた面をどこへ連れていくか。 */
export type WorkStripStepsList =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly landing: StepsLanding
      readonly doneExpanded: boolean
      readonly stepsExpanded: boolean
      readonly workflowPhasesUnfolded: boolean
      readonly unfoldedWorkflowColumns: readonly string[]
      readonly openedWorkflowRuns: readonly TaskId[]
      readonly selectedWorkflowAgent: SelectedWorkflowAgent
    }

/**
 * ワークフロースクリプト1本の図。`open` は図の形と、列の鍵ごとの見出しの所要（フェーズの行から外した所要）と、
 * 手元に出すエージェント（エージェントがいなければ無い）。
 * `folded` は畳んだ見出し1行のエージェントの数と所要。
 */
export type WorkStripWorkflow = {
  readonly taskId: TaskId
  readonly name: string
  readonly counts: readonly WorkflowAgentCount[]
  readonly view:
    | {
        readonly kind: "open"
        readonly diagram: WorkflowDiagram
        readonly columnDurations: ReadonlyMap<string, string>
        readonly hand?: WorkflowAgentHand
      }
    | { readonly kind: "folded"; readonly agentCount: number; readonly duration: string }
}

/** 「手順」の口と、押すと重なって開く依頼の全体の詳細。 */
export type WorkStripSteps = {
  readonly list: WorkStripStepsList
  readonly onToggle: () => void
  readonly onExpandDone: () => void
  readonly onExpandSteps: () => void
  /** 新しい順。開いていないときと、ワークフロースクリプトが無いときは空。 */
  readonly workflows: readonly WorkStripWorkflow[]
  readonly onUnfoldPhases: () => void
  readonly onUnfoldColumn: (column: string) => void
  readonly onOpenRun: (taskId: TaskId) => void
  readonly onAgentPress: (taskId: TaskId, index: number) => void
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
  /** 「手順」の口の字（「手順 12件」）。 */
  readonly toggleLabel: string
  /** 失敗したエージェントがいるか（閉じていても言う）。 */
  readonly hasFailedAgent: boolean
  /** 1行目の右端に出す依頼全体の経過（作業中は「経過 …」、閉じたあとは「所要 …」）。 */
  readonly elapsedLabel: string
  /** 下端に添える目安の残り。出さないときは `none`。 */
  readonly estimate: RemainingEstimate
}

const WORKFLOW_FALLBACK_NAME = "ワークフロースクリプト"

export function workStripStepsOf(input: {
  readonly estimate: RemainingEstimate
  readonly list: WorkStripStepsList
  readonly steps: readonly TurnStep[]
  readonly segments: readonly WorkStripSegment[]
  readonly recaps: ReadonlyMap<string, PhaseRecap>
  readonly finished: boolean
  readonly phaseTimes: PhaseTimesView
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly workflowRuns: readonly WorkflowRun[]
  readonly phaseIds: readonly string[]
  readonly now: number
  readonly elapsedLabel: string
  readonly onToggle: () => void
  readonly onExpandDone: () => void
  readonly onExpandSteps: () => void
  readonly onUnfoldPhases: () => void
  readonly onUnfoldColumn: (column: string) => void
  readonly onOpenRun: (taskId: TaskId) => void
  readonly onAgentPress: (taskId: TaskId, index: number) => void
}): WorkStripSteps {
  const { list } = input
  const planRows =
    list.kind === "open"
      ? stepsPhaseRowsOf(
          input.segments.map((segment) => phaseRowSlotOf(segment, input.recaps)),
          currentWorkStepGroups(input.steps),
        )
      : { rows: [], rest: [] }
  const drawn = list.kind === "open" ? drawnWorkflowsOf(input, list) : []
  const diagramKeys = new Set(drawn.flatMap((workflow) => workflow.phaseKeys))
  const columnKeyOf = (row: StepsPhaseRow): readonly string[] => {
    const key = input.phaseIds[row.phaseIndex]
    return key !== undefined && diagramKeys.has(key) ? [key] : []
  }
  const isColumnRow = (row: StepsPhaseRow): boolean => columnKeyOf(row).length > 0
  const columnDurations = new Map(
    planRows.rows.flatMap((row) => columnKeyOf(row).map((key) => [key, row.duration] as const)),
  )
  const drawnTaskIds = new Set(drawn.map((workflow) => workflow.taskId))
  return {
    list,
    toggleLabel: `手順 ${String(input.steps.length)}件`,
    hasFailedAgent: input.workflowRuns.some((run) =>
      run.agents.some((agent) => workflowBoxStateOf(agent, run.ended) === "failed"),
    ),
    onToggle: input.onToggle,
    onExpandDone: input.onExpandDone,
    onExpandSteps: input.onExpandSteps,
    workflows: drawn.map((workflow): WorkStripWorkflow => ({
      ...omit(workflow, ["phaseKeys"]),
      view: workflow.view.kind === "open" ? { ...workflow.view, columnDurations } : workflow.view,
    })),
    onUnfoldPhases: input.onUnfoldPhases,
    onUnfoldColumn: input.onUnfoldColumn,
    onOpenRun: input.onOpenRun,
    onAgentPress: input.onAgentPress,
    phaseCountLabel: planRows.rows.length === 0 ? "" : `${String(planRows.rows.length)} フェーズ`,
    card:
      list.kind === "open"
        ? stepsPlanCardOf({
            rows: planRows.rows.filter((row) => !isColumnRow(row)),
            finished: input.finished,
            landing: list.landing,
            doneExpanded: list.doneExpanded,
            stepsExpanded: list.stepsExpanded,
          })
        : [],
    rest: planRows.rest,
    phaseTimes: input.phaseTimes,
    backgroundList: toBackgroundListView(
      input.backgroundTasks.filter((task) => !drawnTaskIds.has(task.taskId)),
    ),
    elapsedLabel: input.elapsedLabel,
    estimate: input.estimate,
  }
}

/** 図にするワークフロースクリプト。`phaseKeys` は図の列になったフェーズの id（畳んだ列と「これから」の列を含む）。 */
type DrawnWorkflow = Omit<WorkStripWorkflow, "view"> & {
  readonly phaseKeys: readonly string[]
  readonly view:
    | {
        readonly kind: "open"
        readonly diagram: WorkflowDiagram
        readonly hand?: WorkflowAgentHand
      }
    | { readonly kind: "folded"; readonly agentCount: number; readonly duration: string }
}

function drawnWorkflowsOf(
  input: {
    readonly workflowRuns: readonly WorkflowRun[]
    readonly backgroundTasks: readonly BackgroundTask[]
    readonly phaseIds: readonly string[]
    readonly finished: boolean
    readonly now: number
  },
  list: Extract<WorkStripStepsList, { readonly kind: "open" }>,
): readonly DrawnWorkflow[] {
  return input.workflowRuns.toReversed().map((run, position): DrawnWorkflow => {
    const base = {
      taskId: run.taskId,
      name:
        input.backgroundTasks.find((task) => task.taskId === run.taskId)?.description ??
        WORKFLOW_FALLBACK_NAME,
      counts: workflowAgentCountsOf(run),
    }
    if (position !== 0 && !list.openedWorkflowRuns.includes(run.taskId)) {
      const elapsed = workflowRunElapsedOf(run, input.now)
      return {
        ...base,
        phaseKeys: [],
        view: {
          kind: "folded",
          agentCount: run.agents.length,
          duration: elapsed.kind === "known" ? formatMeasured(elapsed) : "",
        },
      }
    }
    const diagram = workflowDiagramOf(run, input.phaseIds, input.now, {
      phases: input.finished || list.workflowPhasesUnfolded,
      columns: list.unfoldedWorkflowColumns,
    })
    const mapped = run.agents
      .map((agent) => agent.phaseTitle)
      .filter((title) => input.phaseIds.includes(title))
    return {
      ...base,
      phaseKeys: [...diagram.columns.map((column) => column.key), ...mapped],
      view: {
        kind: "open",
        diagram,
        ...workflowHandOf(run, list.selectedWorkflowAgent, input.now),
      },
    }
  })
}
