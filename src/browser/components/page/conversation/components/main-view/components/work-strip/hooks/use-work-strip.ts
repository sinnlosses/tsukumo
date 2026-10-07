// `<WorkStrip>` のロジック。いちばん新しい依頼の段取り・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import { groupBy } from "remeda"

import type { ApiTrouble } from "../../../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../../../shared/session-driver/background-task.ts"
import type {
  PendingAsk,
  StampedPendingAsk,
} from "../../../../../../../../../shared/session-driver/pending-ask.ts"
import { conversationMoment } from "../../../../../../../../../shared/session/conversation-moment.ts"
import {
  recordTimeAt,
  type ReportDrafting,
  type SessionRecord,
  type TurnProgress,
} from "../../../../../../../../../shared/session/session-state.ts"
import {
  turnResultsOf,
  type TurnResult,
} from "../../../../../../../../../shared/session/turn-result.ts"
import type { TurnStep, TurnStepList } from "../../../../../../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
  phaseCount,
  phasePosition,
  type PlannedPhase,
  plannedPhasesOf,
} from "../../../../../../../../../shared/session/work-plan.ts"
import { formatElapsed } from "../../../../../../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../../../../../../domain/tool-summary.ts"
import {
  backgroundSummaryLabel,
  currentWorkStepGroups,
  type CurrentWorkStepGroup,
} from "../../../../../../../../features/current-work/domain/current-work-step.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useMainViewContent } from "../../../../../../../../stores/main-view-content.ts"
import { useMainViewTurns } from "../../../../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useWorkStripSteps } from "../../../../../../../../stores/work-strip-steps.ts"
import { apiRetryNotice } from "../../../../../domain/api-error-label.ts"
import { isClearRequest } from "../../../../../domain/clear-request.ts"
import {
  FINISHED_LABEL,
  isTurnCounting,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../domain/turn-elapsed.ts"
import type { WorkStripResult } from "../../../../../domain/turn-result-mark.ts"
import { useNowWhile } from "../../../../hooks/use-now-while.ts"

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

/** 2行目の再試行の知らせ。 */
export type WorkStripRetry =
  | { readonly kind: "none" }
  | { readonly kind: "retrying"; readonly label: string; readonly detail: string }

/**
 * 2行目。`tone` は字の色（`asking` は答え待ちの色）、`mono` は等幅で組むか（ツールの要約）。
 */
export type WorkStripActivity = {
  readonly text: string
  readonly tone: "quiet" | "asking"
  readonly mono: boolean
  readonly retry: WorkStripRetry
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
 * - `working`: 中身が働くあいだ。送った直後から出す。今の段の名前・「4/7 · 経過 6分12秒」・2行目（段取りが届く前は段の丸が無く「作業中」）
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
      readonly activity: WorkStripActivity
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

const UNPLANNED_HEAD = "作業中"

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
  const newestResult = turnResultsOf(turns, working ? moment : "deliver").at(-1)
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
        ? UNPLANNED_HEAD
        : nowPhase.kind === "phase"
          ? nowPhase.name
          : `${count}段すべて済み`,
    sideLabel:
      planned.length === 0
        ? elapsedLabel
        : `${nowPhase.kind === "phase" ? phasePosition(nowPhase) : `${count}/${count}`} · ${elapsedLabel}`,
    activity: activityOf({
      turnStepList,
      firstPending,
      reportDrafting,
      backgroundTasks,
      retry: retryOf(turn, apiTrouble),
      clearRequest: isClearRequest(currentRequestTextOf(records)),
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

function retryOf(turn: TurnProgress, apiTrouble: ApiTrouble): WorkStripRetry {
  return turn.kind === "running" && apiTrouble.kind === "retrying"
    ? { kind: "retrying", ...apiRetryNotice(apiTrouble) }
    : { kind: "none" }
}

function currentRequestTextOf(records: readonly SessionRecord[]): string {
  return records.findLast((record) => record.kind === "request")?.text ?? ""
}

/**
 * 2行目。強い順に1つ: 答え待ち → report を書いている途中 → 走っている手順 → 背景のタスク →
 * 考えている（`clearRequest` のときは「会話を片付けている」）。
 * 答え待ちの秒は、答え待ちが届いた時刻から数える。
 */
function activityOf(source: {
  readonly turnStepList: Extract<TurnStepList, { readonly kind: "turn" }>
  readonly firstPending: StampedPendingAsk | undefined
  readonly reportDrafting: ReportDrafting
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly retry: WorkStripRetry
  readonly clearRequest: boolean
  readonly now: number
}): WorkStripActivity {
  const { turnStepList, firstPending, retry, now } = source
  if (firstPending !== undefined) {
    const waited = formatElapsed(Math.max(0, Math.floor((now - firstPending.askedAt) / 1000)))
    return {
      text: [`お伺いが届いた`, pendingLabel(firstPending), `答え待ち ${waited}`].join(" · "),
      tone: "asking",
      mono: false,
      retry,
    }
  }
  if (source.reportDrafting.kind === "drafting") {
    return { text: "レポートを書いています", tone: "quiet", mono: false, retry }
  }
  const running = turnStepList.steps.findLast((step) => step.status.kind === "running")
  if (running !== undefined) {
    const seconds = secondsSince(running, now)
    return {
      text: [toolLine(running.name, running.input), seconds]
        .filter((part) => part !== "")
        .join(" · "),
      tone: "quiet",
      mono: true,
      retry,
    }
  }
  const lastDelegated = lastDelegatedStep(source.backgroundTasks, turnStepList.steps)
  if (lastDelegated !== undefined) {
    return {
      text: `背景で · 直前 ${toolLine(lastDelegated.name, lastDelegated.input)}`,
      tone: "quiet",
      mono: true,
      retry,
    }
  }
  const background = backgroundSummaryLabel(source.backgroundTasks)
  if (background !== undefined) {
    return { text: `背景で ${background}`, tone: "quiet", mono: false, retry }
  }
  return {
    text: source.clearRequest ? "会話を片付けている" : "考えている",
    tone: "quiet",
    mono: false,
    retry,
  }
}

/**
 * いちばん新しい背景のタスクがサブエージェントなら、その依頼でサブエージェントの中で最後に動いた手順。
 * サブエージェントの説明は起こしたときのまま変わらず、同じサブエージェントに続きを頼むと段と食い違うので、説明より先に使う。
 */
function lastDelegatedStep(
  backgroundTasks: readonly BackgroundTask[],
  steps: readonly TurnStep[],
): TurnStep | undefined {
  return backgroundTasks.at(-1)?.kind === "agent"
    ? steps.findLast((step) => step.nested)
    : undefined
}

function pendingLabel(pending: PendingAsk): string {
  if (pending.kind === "permission") {
    return `許可: ${toolLine(pending.toolName, pending.input)}`
  }
  const [first, ...rest] = pending.questions
  if (first === undefined) {
    return "質問"
  }
  return rest.length > 0
    ? `質問: ${first.header} ほか${String(rest.length)}問`
    : `質問: ${first.header}`
}

function toolLine(name: string, input: unknown): string {
  const summary = summarizeToolInput(name, input)
  return summary === "" ? name : `${name}  ${summary}`
}

/** 手順が始まってからの秒（「12秒」）。始まった時刻が分からなければ空。 */
function secondsSince(step: TurnStep, now: number): string {
  const startedAt = recordTimeAt(step.startedAt)
  return startedAt === undefined
    ? ""
    : formatElapsed(Math.max(0, Math.floor((now - startedAt) / 1000)))
}
