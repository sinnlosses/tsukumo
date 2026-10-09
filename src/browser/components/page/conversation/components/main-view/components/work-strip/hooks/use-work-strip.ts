// `<WorkStrip>` のロジック。いちばん新しい依頼の段取り・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import { groupBy } from "remeda"

import { conversationMoment } from "../../../../../../../../../shared/session/conversation-moment.ts"
import {
  turnResultsOf,
  type TurnResult,
} from "../../../../../../../../../shared/session/turn-result.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
  phaseCount,
  phasePosition,
  type PlannedPhase,
  plannedPhasesOf,
} from "../../../../../../../../../shared/session/work-plan.ts"
import {
  FINISHED_LABEL,
  isTurnCounting,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../../../../domain/turn-elapsed.ts"
import {
  currentWorkStepGroups,
  type CurrentWorkStepGroup,
} from "../../../../../../../../features/current-work/domain/current-work-step.ts"
import { useNowWhile } from "../../../../../../../../hooks/use-now-while.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useMainViewContent } from "../../../../../../../../stores/main-view-content.ts"
import { useMainViewTurns } from "../../../../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useWorkStripSteps } from "../../../../../../../../stores/work-strip-steps.ts"
import type { WorkStripResult } from "../../../../../domain/turn-result-mark.ts"
import { workActivityOf, type WorkActivity } from "../../../domain/work-activity.ts"

/** 段の丸1つの状態。`asking` は今の段で答え待ちが来ているとき。 */
export type WorkStripPhaseState = "done" | "current" | "asking" | "upcoming"

export type WorkStripPhase = {
  readonly key: string
  /** 丸に描く字（済んだ段は「✓」、答え待ちは「?」、ほかは段の番号）。 */
  readonly mark: string
  /** 読み上げと `title` に出す「4. 段の名前（今の段）」。 */
  readonly label: string
  readonly state: WorkStripPhaseState
}

/** まとまりの `state` は囲みの次の線の色だけに使い、中の段が全部済めば `done`、ほかは `upcoming`。 */
export type WorkStripSlot =
  | { readonly kind: "phase"; readonly phase: WorkStripPhase }
  | {
      readonly kind: "parallel"
      readonly key: string
      readonly label: string
      readonly state: WorkStripPhaseState
      readonly phases: readonly WorkStripPhase[]
    }

/** 「手順 n」の口と、押すと開く依頼の手順の一覧。 */
export type WorkStripSteps = {
  /** 「手順 12 ▾」（開いていれば ▴）。 */
  readonly toggleLabel: string
  /** 一覧が開いているか。`failureSignal` は失敗した手順を指して開いた合図（0 は「手順 n」の口で開いたとき）。 */
  readonly list:
    | { readonly kind: "closed" }
    | { readonly kind: "open"; readonly failureSignal: number }
  readonly onToggle: () => void
  readonly groups: readonly CurrentWorkStepGroup[]
}

/**
 * 帯に出す形。`headLabel` は丸の右の字、`sideLabel` は右端の等幅の字。
 *
 * - `none`: 帯ごと出さない（本文が1つも無いまま閉じた依頼と、段取りも働きも無いとき）
 * - `working`: 中身が働くあいだ。送った直後から出す。今の段の名前・「4/7 · 経過 6分12秒」・2行目（段取りが届く前は段の丸が無く字は空。チップが「作業中」を言うので重ねない）
 * - `finished`: 中身がレポートに入れ替わったあと。済んだ姿の字・「所要 21分49秒」の1行（段取りが無ければ字は空）
 *
 * `result` は状態のチップの状態。`working` は作業中か答え待ち、`finished` は完了・答え待ち・止めた・失敗。
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly result: WorkStripResult
      readonly phases: readonly WorkStripSlot[]
      readonly headLabel: string
      readonly sideLabel: string
      readonly activity: WorkActivity
      readonly steps: WorkStripSteps
    }
  | {
      readonly kind: "finished"
      readonly result: WorkStripResult
      readonly phases: readonly WorkStripSlot[]
      readonly headLabel: string
      readonly sideLabel: string
      readonly steps: WorkStripSteps
    }

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

const PHASE_STATE_SUFFIX = {
  done: "（済）",
  current: "（今の段）",
  asking: "（答え待ち）",
  upcoming: "",
} satisfies Record<WorkStripPhaseState, string>

export function useWorkStrip(): WorkStripModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const records = useSession((session) => session.state.records)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
  const turns = useMainViewTurns()
  const moment = useSession((session) => conversationMoment(session.state))
  const plan = turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN
  const working = content.kind === "work"
  const newestResult = turnResultsOf(turns, moment).at(-1)
  const result = stripResultOf(newestResult, working, plan)
  const shown = content.kind !== "welcome" && result !== undefined
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundTasks.length))

  if (content.kind === "welcome" || turnStepList.kind !== "turn" || result === undefined) {
    return { kind: "none" }
  }

  const planned = plan.kind === "planned" ? plannedPhasesOf(plan) : []
  const nowPhase = currentPhaseOf(plan)
  const count = String(planned.length)
  const { exchange } = content
  const firstPending = pending[0]
  const list: WorkStripSteps["list"] =
    opened.kind === "open" && opened.exchange === exchange
      ? { kind: "open", failureSignal: opened.failureSignal }
      : { kind: "closed" }
  const elapsedWord =
    result === "failed" ? FINISHED_LABEL : turnElapsedLabel(turn, backgroundTasks.length)
  const elapsedLabel = `${elapsedWord} ${turnElapsedText(turn, backgroundTasks.length, now)}`
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)} ${list.kind === "open" ? "▴" : "▾"}`,
    list,
    onToggle: () => toggle(exchange),
    groups: currentWorkStepGroups(turnStepList.steps),
  }
  const stripPhases = slotsOf(planned, working && firstPending !== undefined)

  if (!working) {
    const finishedCount = plan.kind === "planned" ? finishedPhaseCount(plan) : 0
    return {
      kind: "finished",
      result,
      phases: stripPhases,
      headLabel:
        planned.length === 0
          ? ""
          : finishedCount >= planned.length
            ? `${count}段すべて済み`
            : `${count}段のうち${String(finishedCount)}段済み`,
      sideLabel: elapsedLabel,
      steps,
    }
  }

  return {
    kind: "working",
    phases: stripPhases,
    result,
    headLabel:
      planned.length === 0
        ? ""
        : nowPhase.kind === "phase"
          ? nowPhase.name
          : `${count}段すべて済み`,
    sideLabel:
      planned.length === 0
        ? elapsedLabel
        : `${nowPhase.kind === "phase" ? phasePosition(nowPhase) : `${count}/${count}`} · ${elapsedLabel}`,
    activity: workActivityOf({
      turnStepList,
      firstPending,
      reportDrafting,
      backgroundTasks,
      turn,
      apiTrouble,
      records,
      now,
    }),
    steps,
  }
}

/**
 * 最新のやり取りの結果から、チップの状態。出さないなら undefined。
 * 閉じたのに本文が無いやり取りは、段取りがあれば段の進みから（途中なら止めた、全部済みなら完了）、無ければ出さない。
 */
function stripResultOf(
  newest: TurnResult | undefined,
  working: boolean,
  plan: LatestWorkPlan,
): WorkStripResult | undefined {
  if (working) {
    return newest === "awaiting-answer" ? newest : "working"
  }
  if (newest !== undefined && newest !== "no-report") {
    return newest
  }
  if (plan.kind !== "planned") {
    return undefined
  }
  return finishedPhaseCount(plan) < phaseCount(plan.phases) ? "stopped" : "done"
}

function slotsOf(planned: readonly PlannedPhase[], asking: boolean): readonly WorkStripSlot[] {
  const entries = Object.values(groupBy(planned, (phase) => phase.entry))
  return entries.map((members): WorkStripSlot => {
    const phases = members.map((phase) => toPhase(phase, asking))
    const [first] = phases
    if (phases.length === 1 && first !== undefined) {
      return { kind: "phase", phase: first }
    }
    const numbers = members.map((phase) => String(phase.index + 1)).join("·")
    return {
      kind: "parallel",
      key: `group-${String(members[0]?.entry ?? 0)}`,
      label: `並列 ${numbers}`,
      state: phases.every((phase) => phase.state === "done") ? "done" : "upcoming",
      phases,
    }
  })
}

function toPhase({ index, name, state: planned }: PlannedPhase, asking: boolean): WorkStripPhase {
  const state: WorkStripPhaseState = planned === "current" && asking ? "asking" : planned
  return {
    key: String(index),
    mark: state === "done" ? "✓" : state === "asking" ? "?" : String(index + 1),
    label: `${String(index + 1)}. ${name}${PHASE_STATE_SUFFIX[state]}`,
    state,
  }
}
