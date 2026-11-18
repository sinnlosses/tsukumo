// `<WorkStrip>` のロジック。いちばん新しい依頼のワークプラン・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import type { PhaseTimesView } from "../../../../../../../shared/report/report-phase-time.ts"
import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
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
import {
  currentWorkStepGroups,
  toBackgroundListView,
  type CurrentWorkBackgroundList,
} from "../../../../../../features/current-work/current-work-step.ts"
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
import { workSegmentsOf, type WorkStripSegment } from "../../../domain/work-segment.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { type StepsLanding, useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"
import {
  type StepsPhaseRows,
  type StepsPhaseSlotSource,
  stepsPhaseRowsOf,
} from "../domain/steps-phase-row.ts"
import { type WorkStripMark, workStripStatusOf } from "../domain/work-strip-status.ts"

/** 「手順 n件」の口と、押すと開く依頼の手順の一覧。 */
export type WorkStripSteps = {
  /** 「手順 12件」。開閉の印は口の側が付ける。 */
  readonly toggleLabel: string
  /** 一覧が開いているか。`landing` は開いた一覧をどこへ連れていくか。 */
  readonly list:
    | { readonly kind: "closed" }
    | { readonly kind: "open"; readonly landing: StepsLanding }
  readonly onToggle: () => void
  /** ワークプランの全フェーズの行と、どの行にも付かない手順の群。ワークプランが無ければ行は空。 */
  readonly phaseRows: StepsPhaseRows
  /** 済んだ姿のときだけ一覧の末尾に出す、最終レポートの段ごとの所要時間。作業中は `none`。 */
  readonly phaseTimes: PhaseTimesView
  /** 実行中の手順と依頼の手順の間に出す「バックグラウンドタスク」の区画。 */
  readonly backgroundList: CurrentWorkBackgroundList
}

/**
 * 帯に出す形。`mark` は状態の印の形、`headLabel` はその右の見出し、`statement` は見出しの右の一文（作業中・バックグラウンドで作業中は空）、`sideLabel` は右端の等幅の字。
 *
 * - `none`: 帯ごと出さない（本文が1つも無いまま閉じた依頼と、ワークプランも働きも無いとき）
 * - `working`: 中身が働くあいだ。送った直後から出す。見出しは今の段の名前（ワークプランが届く前は「作業中」）・「経過 6分12秒」
 * - `finished`: 中身がレポートに入れ替わったあと。状態の見出し・「所要 21分49秒」の1行
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
      readonly sideLabel: string
      readonly steps: WorkStripSteps
    }
  | {
      readonly kind: "finished"
      readonly result: WorkStripResult
      readonly readingLabel: string
      readonly mark: WorkStripMark
      readonly headLabel: string
      readonly statement: string
      readonly sideLabel: string
      readonly steps: WorkStripSteps
    }

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

const NO_PHASE_TIMES = { kind: "none" } as const satisfies PhaseTimesView

const NO_RECAPS = new Map<string, PhaseRecap>()

const UNKNOWN_RECAP = {
  duration: { kind: "unknown" },
  summary: "",
} as const satisfies PhaseRecap

export function useWorkStrip(): WorkStripModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
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
    opened.kind === "open" && opened.exchange === exchange
      ? { kind: "open", landing: opened.landing }
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
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)}件`,
    list,
    onToggle: () => toggle(exchange),
    phaseRows:
      list.kind === "open"
        ? stepsPhaseRowsOf(
            segments.map((segment) => phaseRowSlotOf(segment, recaps)),
            currentWorkStepGroups(turnStepList.steps),
          )
        : { rows: [], rest: [] },
    phaseTimes:
      newestTurn === undefined || working ? NO_PHASE_TIMES : finalPhaseTimesOf(newestTurn),
    backgroundList: toBackgroundListView(backgroundTasks),
  }

  if (!working) {
    return {
      kind: "finished",
      result,
      readingLabel,
      mark: status.mark,
      headLabel: status.heading,
      statement: status.statement,
      sideLabel: elapsedLabel,
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
    sideLabel: elapsedLabel,
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

function phaseRowSlotOf(
  segment: WorkStripSegment,
  recaps: ReadonlyMap<string, PhaseRecap>,
): StepsPhaseSlotSource {
  return {
    spanName: segment.spanName,
    parallelLabel: segment.parallelLabel,
    phases: segment.phases.map((phase) => ({
      index: phase.index,
      name: phase.name,
      mark: phase.mark,
      state: phase.state,
      skipped: phase.skipped,
      duration: (recaps.get(phase.recapKey) ?? UNKNOWN_RECAP).duration,
    })),
  }
}
