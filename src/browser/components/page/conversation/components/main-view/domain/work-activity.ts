// いま何をしているかの1行(走っている手順・答え待ち・再試行・バックグラウンドタスク)。
// 広い画面の進み具合のプログレスバーの2行目と、狭い画面の「いまの段」の下の1行が同じものを読む。

import type { ApiTrouble } from "../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../shared/session-driver/background-task.ts"
import type {
  PendingAsk,
  StampedPendingAsk,
} from "../../../../../../../shared/session-driver/pending-ask.ts"
import {
  recordTimeAt,
  type SessionRecord,
} from "../../../../../../../shared/session/session-record.ts"
import type {
  ReportDrafting,
  TurnProgress,
} from "../../../../../../../shared/session/turn-progress.ts"
import type { TurnStep, TurnStepList } from "../../../../../../../shared/session/turn-step.ts"
import type {
  WorkflowProgress,
  WorkflowStep,
} from "../../../../../../../shared/session/workflow-step.ts"
import { formatElapsed } from "../../../../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../../../../domain/tool-summary.ts"
import { backgroundSummaryLabel } from "../../../../../../features/current-work/domain/current-work-step.ts"
import { apiRetryNotice } from "../../../domain/api-error-label.ts"
import { isSlashClear } from "../../../domain/slash-clear.ts"

const BACKGROUND_THINKING = "背景で · 考えている"

/** 再試行の知らせ。 */
type WorkRetry =
  | { readonly kind: "none" }
  | { readonly kind: "retrying"; readonly label: string; readonly detail: string }

/**
 * 1行。`tone` は字の色（`asking` は答え待ちの色）、`mono` は等幅で組むか（ツールの要約）。
 */
export type WorkActivity = {
  readonly text: string
  readonly tone: "quiet" | "asking"
  readonly mono: boolean
  readonly retry: WorkRetry
}

type WorkActivitySource = {
  readonly turnStepList: Extract<TurnStepList, { readonly kind: "turn" }>
  readonly firstPending: StampedPendingAsk | undefined
  readonly reportDrafting: ReportDrafting
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly workflowSteps: readonly WorkflowStep[]
  readonly workflowProgress: readonly WorkflowProgress[]
  readonly turn: TurnProgress
  readonly apiTrouble: ApiTrouble
  readonly records: readonly SessionRecord[]
  readonly now: number
}

/**
 * 強い順に1つ: 答え待ち → report を書いている途中 → 走っている手順 →
 * 背景のサブエージェント（「背景で · 考えている」）→ 背景のワークフロースクリプト（走っている手順と秒、手順の合間は「背景で · 考えている」）→ バックグラウンドタスク →
 * 考えている（依頼が会話の片付けのときは「会話を片付けている」）。
 * 答え待ちの秒は、答え待ちが届いた時刻から数える。
 */
export function workActivityOf(source: WorkActivitySource): WorkActivity {
  const { turnStepList, firstPending, now } = source
  const retry = retryOf(source.turn, source.apiTrouble)
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
  if (delegatedStepsDone(source.backgroundTasks, turnStepList.steps)) {
    return { text: BACKGROUND_THINKING, tone: "quiet", mono: false, retry }
  }
  const workflow = latestWorkflow(source)
  if (workflow !== undefined) {
    const { step, thinking } = workflow
    if (step?.running === true) {
      const seconds = formatElapsed(Math.max(0, Math.floor((now - step.startedAt) / 1000)))
      return {
        text: `背景で · ${toolLine(step.name, step.input)} · ${seconds}`,
        tone: "quiet",
        mono: true,
        retry,
      }
    }
    if (thinking) {
      return { text: BACKGROUND_THINKING, tone: "quiet", mono: false, retry }
    }
  }
  const background = backgroundSummaryLabel(source.backgroundTasks)
  if (background !== undefined) {
    return { text: `背景で ${background}`, tone: "quiet", mono: false, retry }
  }
  return {
    text: isSlashClear(currentRequestTextOf(source.records)) ? "会話を片付けている" : "考えている",
    tone: "quiet",
    mono: false,
    retry,
  }
}

function retryOf(turn: TurnProgress, apiTrouble: ApiTrouble): WorkRetry {
  return turn.kind === "running" && apiTrouble.kind === "retrying"
    ? { kind: "retrying", ...apiRetryNotice(apiTrouble) }
    : { kind: "none" }
}

function currentRequestTextOf(records: readonly SessionRecord[]): string {
  return records.findLast((record) => record.kind === "request")?.text ?? ""
}

/**
 * いちばん新しいバックグラウンドタスクがサブエージェントで、その依頼でサブエージェントの中の手順が1つでもあり、どれも走っていないか
 * （走っているものは呼び出し側が先に拾う）。
 * サブエージェントの説明は起こしたときのまま変わらず、同じサブエージェントに続きを頼むと段と食い違うので、説明より先に使う。
 */
function delegatedStepsDone(
  backgroundTasks: readonly BackgroundTask[],
  steps: readonly TurnStep[],
): boolean {
  return backgroundTasks.at(-1)?.kind === "agent" && steps.some((step) => step.nested)
}

/**
 * いちばん新しいバックグラウンドタスクがワークフロースクリプトなら、その中でいちばん新しく始まった手順と、
 * 手順が1つでも始まったうえで走っている agent（start・progress）がいる（手順の合間に考えている）か。
 */
function latestWorkflow(
  source: Pick<WorkActivitySource, "backgroundTasks" | "workflowSteps" | "workflowProgress">,
): { readonly step: WorkflowStep | undefined; readonly thinking: boolean } | undefined {
  const newest = source.backgroundTasks.at(-1)
  if (newest?.kind !== "workflow") {
    return undefined
  }
  const step = source.workflowSteps.find((candidate) => candidate.taskId === newest.taskId)
  const agentRunning =
    source.workflowProgress
      .find((progress) => progress.taskId === newest.taskId)
      ?.agents.some((agent) => agent.state === "start" || agent.state === "progress") === true
  return { step, thinking: step !== undefined && agentRunning }
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
