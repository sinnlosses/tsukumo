// いま何をしているかの1行(走っている手順・答え待ち・再試行・バックグラウンドタスク)。
// 広い画面の進み具合のプログレスバーの2行目と、狭い画面の「いまの段」の下の1行が同じものを読む。

import type { ApiTrouble } from "../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../shared/session-driver/background-task.ts"
import type {
  PendingAsk,
  StampedPendingAsk,
} from "../../../../../../../shared/session-driver/pending-ask.ts"
import type { TaskId } from "../../../../../../../shared/session-driver/task-id.ts"
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
import { backgroundSummaryLabel } from "../../../../../../features/current-work/current-work-step.ts"
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
  readonly firstPending?: StampedPendingAsk
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
 * 手順を持つバックグラウンドタスクのうちいちばん新しく手順が始まったもの
 * （サブエージェントは「背景で · 考えている」、ワークフロースクリプトは走っている手順と秒、手順の合間は「背景で · 考えている」）→
 * 手順を持たないものも含めたバックグラウンドタスクの説明 →
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
  const stepped = latestSteppedBackground({
    backgroundTasks: source.backgroundTasks,
    workflowSteps: source.workflowSteps,
    steps: turnStepList.steps,
  })
  if (stepped?.kind === "agent") {
    return { text: BACKGROUND_THINKING, tone: "quiet", mono: false, retry }
  }
  if (stepped !== undefined) {
    const { step } = stepped
    if (step.running) {
      const seconds = formatElapsed(Math.max(0, Math.floor((now - step.startedAt) / 1000)))
      return {
        text: `背景で · ${toolLine(step.name, step.input)} · ${seconds}`,
        tone: "quiet",
        mono: true,
        retry,
      }
    }
    if (workflowThinking(source.workflowProgress, stepped.taskId)) {
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

type SteppedBackground =
  | { readonly kind: "agent" }
  | { readonly kind: "workflow"; readonly taskId: TaskId; readonly step: WorkflowStep }

/**
 * 手順を持つバックグラウンドタスク（ワークフロースクリプト・サブエージェント）のうち、いちばん新しく手順が始まったもの。同時刻なら顔ぶれの後ろの方。
 * サブエージェントの手順はタスクに結ばれないので、サブエージェント全体で1つの候補とし、始まりは中の手順の最後のもの
 * （復元した手順は始まりが分からず、最古として扱う）。
 */
function latestSteppedBackground(
  source: Pick<WorkActivitySource, "backgroundTasks" | "workflowSteps"> & {
    readonly steps: readonly TurnStep[]
  },
): SteppedBackground | undefined {
  const nested = source.steps.filter((step) => step.nested)
  const agentStartedAt = Math.max(
    ...nested.map((step) => recordTimeAt(step.startedAt) ?? Number.NEGATIVE_INFINITY),
  )
  const lastAgentIndex = source.backgroundTasks.findLastIndex((task) => task.kind === "agent")
  const candidates = source.backgroundTasks.flatMap(
    (task, index): readonly { readonly startedAt: number; readonly found: SteppedBackground }[] => {
      if (task.kind === "workflow") {
        const step = source.workflowSteps.find((candidate) => candidate.taskId === task.taskId)
        return step === undefined
          ? []
          : [{ startedAt: step.startedAt, found: { kind: "workflow", taskId: task.taskId, step } }]
      }
      return index === lastAgentIndex && nested.length > 0
        ? [{ startedAt: agentStartedAt, found: { kind: "agent" } }]
        : []
    },
  )
  return candidates.reduce<(typeof candidates)[number] | undefined>(
    (best, candidate) =>
      best === undefined || candidate.startedAt >= best.startedAt ? candidate : best,
    undefined,
  )?.found
}

/**
 * 選んだワークフロースクリプトの中で、手順が1つでも始まったうえで走っている agent（start・progress）がいる（手順の合間に考えている）か。
 */
function workflowThinking(workflowProgress: readonly WorkflowProgress[], taskId: TaskId): boolean {
  return (
    workflowProgress
      .find((progress) => progress.taskId === taskId)
      ?.agents.some((agent) => agent.state === "start" || agent.state === "progress") === true
  )
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
