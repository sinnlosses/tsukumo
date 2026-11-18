// `<WorkStrip>` のロジック。いちばん新しい依頼のワークプラン・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import { groupBy } from "remeda"

import type { PhaseTimesView } from "../../../../../../../shared/report/report-phase-time.ts"
import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import {
  type PhaseNumber,
  phaseNumberOf,
  phaseOrdinalText,
  PHASE_SPAN_NAMES,
  type PhaseSpan,
  plannedPhaseNumber,
  plannedPhaseTitle,
} from "../../../../../../../shared/session/work-plan-phase-number.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
  phaseCount,
  type PlannedPhase,
  plannedPhasesOf,
} from "../../../../../../../shared/session/work-plan.ts"
import { finalPhaseTimesOf } from "../../../../../../domain/main-view/main-view-report-body.ts"
import { phaseMarkOf } from "../../../../../../domain/phase-mark.ts"
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
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { type StepsLanding, useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"
import {
  type StepsPhaseRows,
  type StepsPhaseSlotSource,
  stepsPhaseRowsOf,
} from "../domain/steps-phase-row.ts"
import { type WorkStripMark, workStripStatusOf } from "../domain/work-strip-status.ts"

/** 段の丸1つの状態。`asking` は今の段で答え待ちが来ているとき。 */
type WorkStripPhaseState = "done" | "current" | "asking" | "upcoming"

export type WorkStripPhase = {
  readonly key: string
  /** 丸に描く字（済んだ段は「✓」、答え待ちは「?」、ほかは段の番号）。 */
  readonly mark: string
  /** 読み上げと `title` に出す「4. 段の名前（今の段）」。 */
  readonly label: string
  readonly state: WorkStripPhaseState
  /** 済んだ段のうち飛ばした段。`state` は `done` のまま。 */
  readonly skipped: boolean
  /** 平らにした並びでの位置と名前（手順の一覧のフェーズの行の元）。 */
  readonly index: number
  readonly name: string
  /** `PlannedPhase.key`。段ごとの所要を引く。 */
  readonly recapKey: string
  /** 押すと依頼の手順の一覧を開き（開いていれば開いたまま）、この段の行を一覧の上端へ送る。 */
  readonly onToggle: () => void
}

type PhaseFlags = { readonly asking: boolean }

/**
 * フェーズのグループの先頭の丸（と並列のフェーズの囲み）に付ける群の名。`name` は「前」「本」「後」、`current` は今の段がその群にあるか。
 * 群の先頭でない・並び全体の群（範囲が無い）なら `none` で、前の丸と線でつなぐ。
 */
export type WorkStripSpanHead =
  | { readonly kind: "none" }
  | { readonly kind: "head"; readonly name: string; readonly current: boolean }

/** 並列のフェーズの `state` は囲みの次の線の色だけに使い、中の段が全部済めば `done`、ほかは `upcoming`。 */
export type WorkStripSlot =
  | {
      readonly kind: "phase"
      readonly spanHead: WorkStripSpanHead
      readonly phase: WorkStripPhase
    }
  | {
      readonly kind: "parallel"
      readonly spanHead: WorkStripSpanHead
      readonly key: string
      readonly label: string
      readonly state: WorkStripPhaseState
      readonly phases: readonly WorkStripPhase[]
    }

/** 済んだ丸を数にまとめた1つ（「✓4」）。`count` は済んだフェーズの数。 */
export type WorkStripCollapsed = {
  readonly kind: "collapsed"
  readonly key: string
  readonly count: number
  readonly label: string
}

/** 帯に並べる1つ。丸（と並列の囲み）か、済んだ丸をまとめた数。 */
export type WorkStripTrackSlot = WorkStripSlot | WorkStripCollapsed

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
  /** 実行中の手順と依頼の手順の間に出す「背景で動いているもの」の区画。 */
  readonly backgroundList: CurrentWorkBackgroundList
}

/**
 * 帯に出す形。`mark` は状態の印の形、`headLabel` はその右の見出し、`statement` は見出しの右の一文（作業中・背景で作業中は空）、`sideLabel` は右端の等幅の字。
 *
 * - `none`: 帯ごと出さない（本文が1つも無いまま閉じた依頼と、ワークプランも働きも無いとき）
 * - `working`: 中身が働くあいだ。送った直後から出す。見出しは今の段の名前（ワークプランが届く前は「作業中」）・「経過 6分12秒」
 * - `finished`: 中身がレポートに入れ替わったあと。状態の見出し・「所要 21分49秒」の1行
 *
 * `result` は状態の印の状態。`working` は作業中・答え待ち・背景で作業中（ターンが終わってバックグラウンドタスクだけ残る）、`finished` は完了・答え待ち・止めた・失敗。
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly result: WorkStripResult
      readonly phases: readonly WorkStripTrackSlot[]
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
      readonly phases: readonly WorkStripTrackSlot[]
      readonly readingLabel: string
      readonly mark: WorkStripMark
      readonly headLabel: string
      readonly statement: string
      readonly sideLabel: string
      readonly steps: WorkStripSteps
    }

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

const NAMED = { kind: "named" } as const satisfies PhaseNumber

const PHASE_STATE_SUFFIX = {
  done: "（済）",
  current: "（今のフェーズ）",
  asking: "（答え待ち）",
  upcoming: "",
} satisfies Record<WorkStripPhaseState, string>

const SKIPPED_PHASE_SUFFIX = "（飛ばした）"

const ASKING_MARK = "?"

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
  const openAtPhase = useWorkStripSteps((state) => state.openAtPhase)
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
  const stripPhases = slotsOf(
    plan,
    planned,
    { asking: working && firstPending !== undefined },
    (phase) => {
      openAtPhase(exchange, phase.index)
    },
  )
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)}件`,
    list,
    onToggle: () => toggle(exchange),
    phaseRows:
      list.kind === "open"
        ? stepsPhaseRowsOf(
            stripPhases.map((slot) => phaseRowSlotOf(slot, recaps)),
            currentWorkStepGroups(turnStepList.steps),
          )
        : { rows: [], rest: [] },
    phaseTimes:
      newestTurn === undefined || working ? NO_PHASE_TIMES : finalPhaseTimesOf(newestTurn),
    backgroundList: toBackgroundListView(backgroundTasks),
  }

  const trackSlots = collapsedTrackOf(stripPhases, planned.length)

  if (!working) {
    return {
      kind: "finished",
      result,
      phases: trackSlots,
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
    phases: trackSlots,
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

function slotsOf(
  plan: LatestWorkPlan,
  planned: readonly PlannedPhase[],
  flags: PhaseFlags,
  onGo: (phase: PlannedPhase) => void,
): readonly WorkStripSlot[] {
  const entries = Object.values(groupBy(planned, (phase) => phase.entry))
  const spanOf = (members: readonly PlannedPhase[]): PhaseSpan | undefined => {
    const number =
      plan.kind === "planned" && members[0] !== undefined
        ? plannedPhaseNumber(plan, members[0])
        : NAMED
    return number.kind === "numbered" && number.span !== "whole" ? number.span : undefined
  }
  const currentSpan = spanOf(planned.filter((phase) => phase.state === "current"))
  return entries.map((members, position): WorkStripSlot => {
    const phases = members.map((phase) => toPhase(plan, phase, flags, onGo))
    const span = spanOf(members)
    const previous = entries[position - 1]
    const spanHead: WorkStripSpanHead =
      span !== undefined && (previous === undefined || spanOf(previous) !== span)
        ? { kind: "head", name: PHASE_SPAN_NAMES[span], current: span === currentSpan }
        : NO_SPAN_HEAD
    const [first] = phases
    if (phases.length === 1 && first !== undefined) {
      return { kind: "phase", spanHead, phase: first }
    }
    const number =
      plan.kind === "planned"
        ? phaseNumberOf(
            plan.delegatedRange,
            members.map((phase) => phase.index),
            phaseCount(plan.phases),
          )
        : NAMED
    const ordinal = phaseOrdinalText(number)
    return {
      kind: "parallel",
      spanHead,
      key: `group-${String(members[0]?.entry ?? 0)}`,
      label: ordinal === "" ? "並列" : `並列 ${ordinal}`,
      state: phases.every((phase) => phase.state === "done") ? "done" : "upcoming",
      phases,
    }
  })
}

const NO_SPAN_HEAD = { kind: "none" } as const satisfies WorkStripSpanHead

/** フェーズがこの数以上で、今のフェーズが `COLLAPSE_AFTER_POSITION` 番目（0 始まり）より後ろなら、済んだ丸を数にまとめる。 */
const COLLAPSE_MIN_PHASES = 9
const COLLAPSE_AFTER_POSITION = 2

/**
 * 丸の並びのうち、今の段より前の済んだ丸を「✓n」の1つにまとめる。
 * 並びが短いか今の段が3つ目までなら、並びをそのまま返す。
 */
function collapsedTrackOf(
  slots: readonly WorkStripSlot[],
  phaseTotal: number,
): readonly WorkStripTrackSlot[] {
  const currentAt = slots.findIndex((slot) =>
    (slot.kind === "phase" ? [slot.phase] : slot.phases).some(
      (phase) => phase.state === "current" || phase.state === "asking",
    ),
  )
  const slotSize = (slot: WorkStripSlot): number => (slot.kind === "phase" ? 1 : slot.phases.length)
  const before = slots.slice(0, Math.max(currentAt, 0))
  const countBefore = before.reduce((sum, slot) => sum + slotSize(slot), 0)
  if (phaseTotal < COLLAPSE_MIN_PHASES || currentAt < 0 || countBefore <= COLLAPSE_AFTER_POSITION) {
    return slots
  }
  const collapsed: WorkStripCollapsed = {
    kind: "collapsed",
    key: "collapsed-done",
    count: countBefore,
    label: `済んだ ${String(countBefore)} フェーズ`,
  }
  return [collapsed, ...slots.slice(currentAt)]
}

function phaseRowSlotOf(
  slot: WorkStripSlot,
  recaps: ReadonlyMap<string, PhaseRecap>,
): StepsPhaseSlotSource {
  const phases = slot.kind === "phase" ? [slot.phase] : slot.phases
  return {
    spanName: slot.spanHead.kind === "head" ? slot.spanHead.name : "",
    parallelLabel: slot.kind === "parallel" ? slot.label : "",
    phases: phases.map((phase) => ({
      index: phase.index,
      name: phase.name,
      mark: phase.mark,
      state: phase.state,
      skipped: phase.skipped,
      duration: (recaps.get(phase.recapKey) ?? UNKNOWN_RECAP).duration,
    })),
  }
}

function toPhase(
  plan: LatestWorkPlan,
  phase: PlannedPhase,
  flags: PhaseFlags,
  onGo: (phase: PlannedPhase) => void,
): WorkStripPhase {
  const state: WorkStripPhaseState =
    phase.state === "current" && flags.asking ? "asking" : phase.state
  const key = phaseKeyOf(phase)
  return {
    key,
    mark: state === "asking" ? ASKING_MARK : phaseMarkOf(plan, phase),
    label: `${plan.kind === "planned" ? plannedPhaseTitle(plan, phase) : phase.name}${phase.skipped ? SKIPPED_PHASE_SUFFIX : PHASE_STATE_SUFFIX[state]}`,
    state,
    skipped: phase.skipped,
    index: phase.index,
    name: phase.name,
    recapKey: phase.key,
    onToggle: () => onGo(phase),
  }
}

function phaseKeyOf(phase: PlannedPhase): string {
  return String(phase.index)
}
