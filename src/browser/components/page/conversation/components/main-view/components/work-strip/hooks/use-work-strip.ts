// `<WorkStrip>` のロジック。いちばん新しい依頼の段取り・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import { useState } from "react"

import type { ApiTrouble } from "../../../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../../../shared/session-driver/background-task.ts"
import type { PendingAsk } from "../../../../../../../../../shared/session-driver/pending-ask.ts"
import type {
  ReportDrafting,
  TurnProgress,
} from "../../../../../../../../../shared/session/session-state.ts"
import type { TurnStep, TurnStepList } from "../../../../../../../../../shared/session/turn-step.ts"
import type { LatestWorkPlan } from "../../../../../../../../../shared/session/work-plan.ts"
import { formatElapsed } from "../../../../../../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../../../../../../domain/tool-summary.ts"
import {
  backgroundSummaryLabel,
  currentWorkStepGroups,
  type CurrentWorkStepGroup,
} from "../../../../../../../../features/current-work/domain/current-work-step.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useMainViewContent } from "../../../../../../../../stores/main-view-content.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { apiRetryNotice } from "../../../../../domain/api-error-label.ts"
import {
  isTurnCounting,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../domain/turn-elapsed.ts"
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
  readonly open: boolean
  readonly onToggle: () => void
  readonly groups: readonly CurrentWorkStepGroup[]
}

/**
 * 帯に出す形。`headLabel` は丸の右の字、`sideLabel` は右端の等幅の字。
 *
 * - `none`: 段取りの無い依頼（帯ごと出さない）
 * - `working`: 中身が働くあいだ。今の段の名前・「4/7 · 経過 6分12秒」・2行目
 * - `finished`: 中身がレポートに入れ替わったあと。済んだ姿の字・「所要 21分49秒」の1行
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly phases: readonly WorkStripPhase[]
      readonly headLabel: string
      readonly sideLabel: string
      readonly activity: WorkStripActivity
      readonly steps: WorkStripSteps
    }
  | {
      readonly kind: "finished"
      readonly phases: readonly WorkStripPhase[]
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
  const contentKind = useMainViewContent((state) => state.content.kind)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const [open, setOpen] = useState(false)
  const plan = turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN
  const shown = contentKind !== "welcome" && plan.kind === "planned"
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundTasks.length))

  if (!shown || turnStepList.kind !== "turn" || plan.kind !== "planned") {
    return { kind: "none" }
  }

  const { phases, current } = plan
  const firstPending = pending[0]
  const working = contentKind === "work"
  const elapsedLabel = `${turnElapsedLabel(turn, backgroundTasks.length)} ${turnElapsedText(turn, backgroundTasks.length, now)}`
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)} ${open ? "▴" : "▾"}`,
    open,
    onToggle: () => setOpen((wasOpen) => !wasOpen),
    groups: currentWorkStepGroups(turnStepList.steps),
  }
  const stripPhases = phases.map((name, index) =>
    toPhase(name, index, phaseState(index, current, working && firstPending !== undefined)),
  )

  if (!working) {
    return {
      kind: "finished",
      phases: stripPhases,
      headLabel:
        current >= phases.length
          ? `${String(phases.length)}段すべて済み`
          : `${String(phases.length)}段のうち${String(current)}段済み`,
      sideLabel: elapsedLabel,
      steps,
    }
  }

  return {
    kind: "working",
    phases: stripPhases,
    headLabel: phases[current] ?? `${String(phases.length)}段すべて済み`,
    sideLabel: `${String(Math.min(current + 1, phases.length))}/${String(phases.length)} · ${elapsedLabel}`,
    activity: activityOf({
      turnStepList,
      firstPending,
      reportDrafting,
      backgroundTasks,
      retry: retryOf(turn, apiTrouble),
      now,
    }),
    steps,
  }
}

function phaseState(index: number, current: number, asking: boolean): WorkStripPhaseState {
  if (index < current) {
    return "done"
  }
  if (index === current) {
    return asking ? "asking" : "current"
  }
  return "upcoming"
}

function toPhase(name: string, index: number, state: WorkStripPhaseState): WorkStripPhase {
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

/**
 * 2行目。強い順に1つ: 答え待ち → report を書いている途中 → 走っている手順 → 背景のタスク → 考えている。
 * 答え待ちの秒は、答え待ちと同じ id の手順が始まった時刻から数える。
 */
function activityOf(source: {
  readonly turnStepList: Extract<TurnStepList, { readonly kind: "turn" }>
  readonly firstPending: PendingAsk | undefined
  readonly reportDrafting: ReportDrafting
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly retry: WorkStripRetry
  readonly now: number
}): WorkStripActivity {
  const { turnStepList, firstPending, retry, now } = source
  if (firstPending !== undefined) {
    const askedStep = turnStepList.steps.find((step) => step.toolUseId === firstPending.id)
    const waited = askedStep === undefined ? "" : secondsSince(askedStep, now)
    return {
      text: [
        `お伺いが届いた`,
        pendingLabel(firstPending),
        waited === "" ? "" : `答え待ち ${waited}`,
      ]
        .filter((part) => part !== "")
        .join(" · "),
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
  const background = backgroundSummaryLabel(source.backgroundTasks)
  if (background !== undefined) {
    return { text: `背景で ${background}`, tone: "quiet", mono: false, retry }
  }
  return { text: "考えている", tone: "quiet", mono: false, retry }
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
  return step.startedAt.kind === "stamped"
    ? formatElapsed(Math.max(0, Math.floor((now - step.startedAt.at) / 1000)))
    : ""
}
