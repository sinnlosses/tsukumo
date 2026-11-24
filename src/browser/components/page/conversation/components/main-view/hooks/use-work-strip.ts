// `<WorkStrip>` のロジック。いちばん新しい依頼のワークプラン・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import type { PhaseTimesView } from "../../../../../../../shared/report/report-phase-time.ts"
import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import { phaseDurations } from "../../../../../../../shared/session/phase-duration.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
  NO_DELEGATED_RANGE,
  phaseCount,
  plannedPhasesOf,
} from "../../../../../../../shared/session/work-plan.ts"
import { finalPhaseTimesOf } from "../../../../../../domain/main-view/main-view-report-body.ts"
import {
  FINISHED_LABEL,
  isTurnCounting,
  turnCountedUntil,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../../domain/turn-elapsed.ts"
import { usePhoneWidth } from "../../../../../../hooks/use-phone-width.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useMainViewTurns } from "../../../../../../stores/main-view-turn.ts"
import {
  readingLabelOf,
  readingSectionOf,
  useReadingSection,
} from "../../../../../../stores/reading-section.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { turnFailureLabel } from "../../../domain/api-error-label.ts"
import { type PhaseRecap, phaseRecapsOf } from "../../../domain/phase-recap.ts"
import type { WorkStripResult } from "../../../domain/turn-result-mark.ts"
import { turnResultsOf, type TurnResult } from "../../../domain/turn-result.ts"
import { workSegmentsOf } from "../../../domain/work-segment.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"
import { type RemainingEstimate, remainingEstimateOf } from "../domain/remaining-estimate.ts"
import { type WorkStripMark, workStripStatusOf } from "../domain/work-strip-status.ts"
import { type WorkStripSteps, workStripStepsOf } from "./use-work-strip-step-list.ts"

/**
 * 帯に出す形。`mark` は状態の印の形、`headLabel` はその右の見出し、`statement` は見出しの右の一文（作業中・バックグラウンドで作業中は空）。
 *
 * - `none`: 帯ごと出さない（本文が1つも無いまま閉じた依頼と、ワークプランも働きも無いとき）
 * - `working`: 中身が働くあいだ。送った直後から出す。見出しは今の段の名前（ワークプランが届く前は「作業中」）
 * - `finished`: 中身がレポートに入れ替わったあと。状態の見出しの1行
 *
 * `result` は状態の印の状態。`working` は作業中・答え待ち・バックグラウンドで作業中（ターンが終わってバックグラウンドタスクだけ残る）、`finished` は完了・答え待ち・止めた・失敗。
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly result: WorkStripResult
      /** 列を畳んでいるあいだの「いま: <節>」。出さないときは空。 */
      readonly readingLabel: string
      readonly mark: WorkStripMark
      readonly headLabel: string
      readonly statement: string
      /** 位置の右に出す目安の残り。出さないときは `none`。 */
      readonly estimate: RemainingEstimate
      readonly steps: WorkStripSteps
    }
  | {
      readonly kind: "finished"
      readonly result: WorkStripResult
      readonly readingLabel: string
      readonly mark: WorkStripMark
      readonly headLabel: string
      readonly statement: string
      readonly estimate: RemainingEstimate
      readonly steps: WorkStripSteps
    }

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

const NO_PHASE_TIMES = { kind: "none" } as const satisfies PhaseTimesView

const NO_ESTIMATE = { kind: "none" } as const satisfies RemainingEstimate

const NO_RECAPS = new Map<string, PhaseRecap>()

export function useWorkStrip(): WorkStripModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
  const expandDone = useWorkStripSteps((state) => state.expandDone)
  const expandSteps = useWorkStripSteps((state) => state.expandSteps)
  const unfoldWorkflowPhases = useWorkStripSteps((state) => state.unfoldWorkflowPhases)
  const foldWorkflowPhases = useWorkStripSteps((state) => state.foldWorkflowPhases)
  const unfoldWorkflowColumn = useWorkStripSteps((state) => state.unfoldWorkflowColumn)
  const openWorkflowRun = useWorkStripSteps((state) => state.openWorkflowRun)
  const selectWorkflowAgent = useWorkStripSteps((state) => state.selectWorkflowAgent)
  const selectWorkflowPrelude = useWorkStripSteps((state) => state.selectWorkflowPrelude)
  const workflowRuns = useSession((session) => session.state.workflowRuns)
  const turns = useMainViewTurns()
  const moment = useSession((session) => conversationMoment(session.state))
  const plan = turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN
  const working = content.kind === "work"
  const newestTurn = turns.at(-1)
  const newestResult = turnResultsOf(turns, moment).at(-1)
  const result = stripResultOf(newestResult ?? "no-report", working, plan, {
    leftToBackground: turn.kind !== "running" && pending.length === 0 && backgroundTasks.length > 0,
  })
  const shown = content.kind !== "welcome" && result !== undefined
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundTasks.length))
  const phoneWidth = usePhoneWidth()
  const planned = plan.kind === "planned" ? plannedPhasesOf(plan) : []
  const readingLabel = useReadingSection((state) =>
    state.outlineCollapsed ? readingLabelOf(readingSectionOf(state)) : "",
  )

  if (content.kind === "welcome" || turnStepList.kind !== "turn" || result === undefined) {
    return { kind: "none" }
  }

  const nowPhase = currentPhaseOf(plan)
  const status = workStripStatusOf({
    result,
    phaseName: nowPhase.kind === "phase" ? nowPhase.name : "",
    planned: planned.length > 0,
    pending,
    failureReason:
      newestTurn?.failure.kind === "failed" ? turnFailureLabel(newestTurn.failure.failure) : "",
  })
  const { exchange } = content
  const firstPending = pending[0]
  const list: WorkStripSteps["list"] =
    opened.kind === "steps" && opened.exchange === exchange
      ? {
          kind: "open",
          landing: opened.landing,
          doneExpanded: opened.doneExpanded,
          stepsExpanded: opened.stepsExpanded,
          workflowPhasesUnfolded: opened.workflowPhasesUnfolded,
          unfoldedWorkflowColumns: opened.unfoldedWorkflowColumns,
          openedWorkflowRuns: opened.openedWorkflowRuns,
          selectedWorkflowAgent: opened.selectedWorkflowAgent,
        }
      : { kind: "closed" }
  const elapsedWord =
    result === "failed" ? FINISHED_LABEL : turnElapsedLabel(turn, backgroundTasks.length)
  const elapsedLabel = `${elapsedWord} ${turnElapsedText(turn, backgroundTasks.length, now)}`
  const recaps =
    list.kind === "closed"
      ? NO_RECAPS
      : phaseRecapsOf(turnStepList.trail, {
          kind: "stamped",
          at: turnCountedUntil(turn, backgroundTasks.length, now),
        })
  const { segments } = workSegmentsOf(plan, {
    asking: working && firstPending !== undefined,
    finished: !working,
  })
  const estimate =
    plan.kind === "planned"
      ? remainingEstimateOf({
          rows: phaseDurations(
            turnStepList.trail,
            { kind: "stamped", at: turnCountedUntil(turn, backgroundTasks.length, now) },
            "none",
          ),
          current: plan.current,
          rangePending: plan.delegatedRange.kind === "pending",
          shown: (result === "working" || result === "background") && !phoneWidth,
        })
      : NO_ESTIMATE
  const steps = workStripStepsOf({
    estimate,
    list,
    steps: turnStepList.steps,
    segments,
    recaps,
    finished: !working,
    phaseTimes:
      newestTurn === undefined || working ? NO_PHASE_TIMES : finalPhaseTimesOf(newestTurn),
    backgroundTasks,
    workflowRuns,
    phaseIds: plan.kind === "planned" ? plan.phaseIds : [],
    delegatedRange: plan.kind === "planned" ? plan.delegatedRange : NO_DELEGATED_RANGE,
    now,
    elapsedLabel: elapsedLabel,
    onToggle: () => {
      toggle(exchange)
    },
    onExpandDone: () => {
      expandDone(exchange)
    },
    onExpandSteps: () => {
      expandSteps(exchange)
    },
    onUnfoldPhases: () => {
      unfoldWorkflowPhases(exchange)
    },
    onFoldPhases: () => {
      foldWorkflowPhases(exchange)
    },
    onUnfoldColumn: (column) => {
      unfoldWorkflowColumn(exchange, column)
    },
    onOpenRun: (taskId) => {
      openWorkflowRun(exchange, taskId)
    },
    onAgentPress: (taskId, index) => {
      selectWorkflowAgent(exchange, taskId, index)
    },
    onPreludePress: (taskId) => {
      selectWorkflowPrelude(exchange, taskId)
    },
  })

  if (!working) {
    return {
      kind: "finished",
      result,
      readingLabel,
      mark: status.mark,
      headLabel: status.heading,
      statement: status.statement,
      estimate: NO_ESTIMATE,
      steps,
    }
  }

  return {
    kind: "working",
    result,
    readingLabel,
    mark: status.mark,
    headLabel: status.heading,
    statement: status.statement,
    estimate,
    steps,
  }
}

/**
 * 最新のやり取りの結果から、チップの状態。出さないなら undefined。
 * 閉じたのに本文が無いやり取りは、ワークプランがあれば段の進みから（途中なら止めた、全部済みなら完了）、無ければ出さない。
 */
function stripResultOf(
  newest: TurnResult,
  working: boolean,
  plan: LatestWorkPlan,
  { leftToBackground }: { readonly leftToBackground: boolean },
): WorkStripResult | undefined {
  if (working) {
    if (newest === "awaiting-answer") {
      return newest
    }
    return leftToBackground ? "background" : "working"
  }
  if (newest !== "no-report") {
    return newest
  }
  if (plan.kind !== "planned") {
    return undefined
  }
  return finishedPhaseCount(plan) < phaseCount(plan.phases) ? "stopped" : "done"
}
