// `<WorkStrip>` のロジック。いちばん新しい依頼の段取り・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import type { ApiTrouble } from "../../../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../../../shared/session-driver/background-task.ts"
import type {
  PendingAsk,
  StampedPendingAsk,
} from "../../../../../../../../../shared/session-driver/pending-ask.ts"
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
import { useWorkStripSteps } from "../../../../../../../../stores/work-strip-steps.ts"
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
 * - `none`: 帯ごと出さない（段取りの無いまま閉じた依頼）
 * - `working`: 中身が働くあいだ。送った直後から出す。今の段の名前・「4/7 · 経過 6分12秒」・2行目（段取りが届く前は段の丸が無く「作業中」）。
 *   `spinning` は回る印を出すか（答え待ちのあいだは止める）
 * - `finished`: 中身がレポートに入れ替わったあと。済んだ姿の字・「所要 21分49秒」の1行
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly phases: readonly WorkStripPhase[]
      readonly spinning: boolean
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
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
  const plan = turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN
  const working = content.kind === "work"
  const shown = content.kind !== "welcome" && (working || plan.kind === "planned")
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundTasks.length))

  if (content.kind === "welcome" || turnStepList.kind !== "turn") {
    return { kind: "none" }
  }
  if (plan.kind !== "planned" && !working) {
    return { kind: "none" }
  }

  const { phases, current } = plan.kind === "planned" ? plan : { phases: [], current: 0 }
  const { exchange } = content
  const firstPending = pending[0]
  const list: WorkStripSteps["list"] =
    opened.kind === "open" && opened.exchange === exchange
      ? { kind: "open", failureSignal: opened.failureSignal }
      : { kind: "closed" }
  const elapsedLabel = `${turnElapsedLabel(turn, backgroundTasks.length)} ${turnElapsedText(turn, backgroundTasks.length, now)}`
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)} ${list.kind === "open" ? "▴" : "▾"}`,
    list,
    onToggle: () => toggle(exchange),
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
    spinning: firstPending === undefined,
    headLabel:
      phases.length === 0
        ? UNPLANNED_HEAD
        : (phases[current] ?? `${String(phases.length)}段すべて済み`),
    sideLabel:
      phases.length === 0
        ? elapsedLabel
        : `${String(Math.min(current + 1, phases.length))}/${String(phases.length)} · ${elapsedLabel}`,
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
 * 答え待ちの秒は、答え待ちが届いた時刻から数える。
 */
function activityOf(source: {
  readonly turnStepList: Extract<TurnStepList, { readonly kind: "turn" }>
  readonly firstPending: StampedPendingAsk | undefined
  readonly reportDrafting: ReportDrafting
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly retry: WorkStripRetry
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
  return { text: "考えている", tone: "quiet", mono: false, retry }
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
  return step.startedAt.kind === "stamped"
    ? formatElapsed(Math.max(0, Math.floor((now - step.startedAt.at) / 1000)))
    : ""
}
