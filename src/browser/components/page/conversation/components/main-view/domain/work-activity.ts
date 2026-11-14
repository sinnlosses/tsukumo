// いま何をしているかの1行(走っている手順・答え待ち・再試行・バックグラウンドタスク)。
// 広い画面の進み具合のプログレスバーの2行目と、狭い画面の「いまの段」の下の1行が同じものを読む。

import type { ApiTrouble } from "../../../../../../../shared/session-driver/api-trouble.ts"
import type { BackgroundTask } from "../../../../../../../shared/session-driver/background-task.ts"
import type {
  PendingAsk,
  StampedPendingAsk,
} from "../../../../../../../shared/session-driver/pending-ask.ts"
import type { RateLimit } from "../../../../../../../shared/session-driver/rate-limit.ts"
import type { TaskId } from "../../../../../../../shared/session-driver/task-id.ts"
import {
  type RecordTime,
  recordTimeAt,
  type SessionRecord,
} from "../../../../../../../shared/session/session-record.ts"
import type {
  ReportDrafting,
  TurnProgress,
} from "../../../../../../../shared/session/turn-progress.ts"
import type { TurnStep, TurnStepList } from "../../../../../../../shared/session/turn-step.ts"
import {
  phaseNumberText,
  phasePosition,
} from "../../../../../../../shared/session/work-plan-phase-number.ts"
import type { WorkPhase } from "../../../../../../../shared/session/work-plan.ts"
import type {
  WorkflowProgress,
  WorkflowStep,
} from "../../../../../../../shared/session/workflow-step.ts"
import {
  type WaitKind,
  waitKindOfTool,
} from "../../../../../../../shared/usage/experience-metric-record.ts"
import type {
  UsualDurations,
  UsualSpread,
} from "../../../../../../../shared/usage/usual-duration.ts"
import { formatElapsed } from "../../../../../../../shared/utils/elapsed-time.ts"
import { backgroundSummaryLabel } from "../../../../../../features/current-work/current-work-step.ts"
import { apiRetryNotice } from "../../../domain/api-error-label.ts"
import { rateLimitResetText } from "../../../domain/rate-limit-label.ts"
import { isSlashClear } from "../../../domain/slash-clear.ts"
import { narrateToolUse } from "../../../domain/tool-narration.ts"
import { summarizeToolInput } from "../../../domain/tool-summary.ts"
import { minutesOf } from "../../../domain/usual-duration.ts"

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
  readonly quiet: WorkQuiet
}

type WorkActivitySource = WorkQuietSource & {
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

/** 止まって見えるかの判定に、`WorkActivitySource` が足す材料。 */
type WorkQuietSource = {
  readonly rateLimit: RateLimit
  readonly usual: UsualDurations
}

export type WorkQuietInput = WorkQuietSource & {
  readonly steps: readonly TurnStep[]
  /** 答え待ちがあるか（あれば利用者の番なので、止まって見えるとは言わない）。 */
  readonly asking: boolean
  readonly backgroundTasks: readonly BackgroundTask[]
  readonly turn: TurnProgress
  readonly apiTrouble: ApiTrouble
  readonly records: readonly SessionRecord[]
  readonly now: number
}

/**
 * 止まって見えるときの言い方（tsukumo の固定の文）。`label` は行の頭の語。
 *
 * - `limited`: 利用の上限に達した。自動では続けない
 * - `retrying`: API を呼び直している
 * - `stalled`: 新しい動きが無いまま、いつもの幅の上端の {@link QUIET_STALLED_FACTOR} 倍（下限 {@link QUIET_STALLED_FLOOR_SECONDS} 秒・幅が無ければ {@link QUIET_STALLED_UNKNOWN_SECONDS} 秒）を超えた
 * - `waiting`: 新しい動きが {@link QUIET_WAITING_SECONDS} 秒以上無く、走っている手順か背景の仕事を待っている
 */
export type WorkQuiet =
  | { readonly kind: "none" }
  | {
      readonly kind: "waiting" | "retrying" | "limited" | "stalled"
      readonly label: string
      readonly text: string
    }

const QUIET_WAITING_SECONDS = 90

const QUIET_STALLED_FACTOR = 3

const QUIET_STALLED_FLOOR_SECONDS = 5 * 60

const QUIET_STALLED_UNKNOWN_SECONDS = 15 * 60

const NO_QUIET = { kind: "none" } as const satisfies WorkQuiet

/** 待っている相手の語。 */
const WAIT_SUBJECT = {
  bash: "コマンド",
  agent: "任せた役",
  workflow: "ワークフロー",
  other: "道具",
} as const satisfies Record<WaitKind, string>

/**
 * 強い順に1つ: 上限 → 再試 → 動かない → 待ち。答え待ちのあいだ・働いていないあいだは出さない。
 * 新しい動きは、記録に打たれたいちばん新しい時刻（依頼・セリフ・ワークプラン・手順の始まりと終わり）から数える。
 */
export function workQuietOf(input: WorkQuietInput): WorkQuiet {
  const working = input.turn.kind === "running" || input.backgroundTasks.length > 0
  if (input.asking || !working) {
    return NO_QUIET
  }
  if (input.rateLimit.kind === "rejected" || isRateLimited(input.apiTrouble)) {
    const reset =
      input.rateLimit.kind === "rejected"
        ? rateLimitResetText(input.rateLimit, input.now)
        : ({ kind: "unknown" } as const)
    return {
      kind: "limited",
      label: "上限",
      text:
        reset.kind === "known"
          ? `利用の上限に達した。${reset.text} に戻る。自動では続けない。`
          : "利用の上限に達した。自動では続けない。",
    }
  }
  if (input.turn.kind === "running" && input.apiTrouble.kind === "retrying") {
    const notice = apiRetryNotice(input.apiTrouble)
    return { kind: "retrying", label: "再試", text: `${notice.detail}。${notice.label}` }
  }
  const motions = motionTimesOf(input.records, input.steps)
  const quietSeconds =
    motions.length === 0 ? 0 : Math.max(0, Math.floor((input.now - Math.max(...motions)) / 1000))
  const waitKind = waitKindOf(input.steps, input.backgroundTasks)
  const spread: UsualSpread =
    waitKind === "none" ? { kind: "empty", count: 0 } : input.usual.waits[waitKind]
  const stalled = stalledThresholdOf(spread)
  if (quietSeconds > stalled.seconds) {
    return {
      kind: "stalled",
      label: "動かない",
      text:
        stalled.kind === "usual"
          ? `いつもの ${String(QUIET_STALLED_FACTOR)} 倍（${minutesText(stalled.seconds)}）を超えた。止まっているかもしれない。`
          : `${minutesText(stalled.seconds)}、新しい動きが無い。止まっているかもしれない。`,
    }
  }
  if (quietSeconds < QUIET_WAITING_SECONDS || waitKind === "none") {
    return NO_QUIET
  }
  const usual =
    spread.kind === "empty"
      ? ""
      : `（いつもは ${usualRangeMinutes(spread.lowSeconds, spread.highSeconds)}）`
  return {
    kind: "waiting",
    label: "待ち",
    text: `${formatElapsed(quietSeconds)}、新しい動きが無い。${WAIT_SUBJECT[waitKind]}の終わりを待っている${usual}`,
  }
}

/**
 * 強い順に1つ: 答え待ち → report を書いている途中 → 走っている手順 →
 * 手順を持つバックグラウンドタスクのうちいちばん新しく手順が始まったもの
 * （サブエージェントは「背景で · 考えている」、ワークフロースクリプトは走っている手順と秒、手順の合間は「背景で · 考えている」）→
 * 手順を持たないものも含めたバックグラウンドタスクの説明 →
 * 考えている（依頼が会話の片付けのときは「会話を片付けている」）。
 * 答え待ちの秒は、答え待ちが届いた時刻から数える。止まって見えるかは {@link workQuietOf} が決める。
 */
export function workActivityOf(source: WorkActivitySource): WorkActivity {
  return {
    ...activityLineOf(source),
    quiet: workQuietOf({
      ...source,
      steps: source.turnStepList.steps,
      asking: source.firstPending !== undefined,
    }),
  }
}

/** 1行の頭に付ける語。 */
export function workActivityLabelOf(activity: WorkActivity): string {
  return activity.tone === "asking" ? "待ち" : "手元"
}

/** 走っている手順の道具と引数の要約（「出力を見る」で開く字）。走っていなければ空。 */
export function runningStepLineOf(steps: readonly TurnStep[]): string {
  const running = steps.findLast((step) => step.status.kind === "running")
  return running === undefined ? "" : toolLine(running.name, running.input)
}

function activityLineOf(source: WorkActivitySource): Omit<WorkActivity, "quiet"> {
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
    const line = narratedLine(running.name, running.input)
    return {
      text: [`${line.text}${phaseRangeSuffix(running.phase)}`, seconds]
        .filter((part) => part !== "")
        .join(" · "),
      tone: "quiet",
      mono: line.mono,
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
      const line = narratedLine(step.name, step.input)
      return {
        text: `背景で · ${line.text} · ${seconds}`,
        tone: "quiet",
        mono: line.mono,
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

/** SDK が自分で呼び直している最中（`retrying`）は上限と言わず、再試の側に回す。 */
function isRateLimited(apiTrouble: ApiTrouble): boolean {
  return apiTrouble.kind === "errored" && apiTrouble.error === "rate_limit"
}

/** 記録に打たれた時刻（依頼・セリフ・ワークプラン・レポート・手順の始まりと終わり）。 */
function motionTimesOf(
  records: readonly SessionRecord[],
  steps: readonly TurnStep[],
): readonly number[] {
  const recorded = records.flatMap((record): readonly RecordTime[] => {
    switch (record.kind) {
      case "request":
      case "aside":
      case "report":
      case "work-plan":
      case "speech":
      case "reaction":
      case "aizuchi-chip":
        return [record.time]
      case "tool":
        return [
          record.startedAt,
          ...(record.status.kind === "finished" ? [record.status.finishedAt] : []),
          ...(record.backgroundEnd.kind === "notified" ? [record.backgroundEnd.at] : []),
        ]
      default:
        return []
    }
  })
  return [...recorded, ...steps.map((step) => step.startedAt)].flatMap((time) => {
    const at = recordTimeAt(time)
    return at === undefined ? [] : [at]
  })
}

/**
 * 動かないと言い始める秒。`usual` はいつもの幅の上端の倍、`fixed` は幅が無いときか下限が効いたときで、
 * 文の言い方が分かれる（下限の秒を「いつもの何倍」とは言わない）。
 */
function stalledThresholdOf(spread: UsualSpread): {
  readonly kind: "usual" | "fixed"
  readonly seconds: number
} {
  if (spread.kind === "empty") {
    return { kind: "fixed", seconds: QUIET_STALLED_UNKNOWN_SECONDS }
  }
  const usual = spread.highSeconds * QUIET_STALLED_FACTOR
  return usual >= QUIET_STALLED_FLOOR_SECONDS
    ? { kind: "usual", seconds: usual }
    : { kind: "fixed", seconds: QUIET_STALLED_FLOOR_SECONDS }
}

/** 待っている相手の種類。走っている手順があればその道具、無ければ背景の仕事のうち最後のもの。 */
function waitKindOf(
  steps: readonly TurnStep[],
  backgroundTasks: readonly BackgroundTask[],
): WaitKind | "none" {
  const running = steps.findLast((step) => step.status.kind === "running" && !step.nested)
  if (running !== undefined) {
    return waitKindOfTool(running.name)
  }
  const task = backgroundTasks.at(-1)
  return task === undefined ? "none" : BACKGROUND_WAIT_KIND[task.kind]
}

const BACKGROUND_WAIT_KIND = {
  shell: "bash",
  agent: "agent",
  workflow: "workflow",
  other: "other",
} as const satisfies Record<BackgroundTask["kind"], WaitKind>

/** 「15 分」。分に満たなければ秒で言う。 */
function minutesText(seconds: number): string {
  return seconds < 60 ? `${String(seconds)} 秒` : `${String(Math.round(seconds / 60))} 分`
}

/** 「3〜5 分」（両端が同じ分なら「約 3 分」）。 */
function usualRangeMinutes(lowSeconds: number, highSeconds: number): string {
  const low = minutesOf(lowSeconds)
  const high = minutesOf(highSeconds)
  return low === high ? `約 ${String(low)} 分` : `${String(low)}〜${String(high)} 分`
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

/** 言い換えの文。表に無い道具は今の「名前  要約」に落とし、等幅で組む。 */
function narratedLine(
  name: string,
  input: unknown,
): { readonly text: string; readonly mono: boolean } {
  const sentence = narrateToolUse(name, input)
  return sentence === undefined
    ? { text: toolLine(name, input), mono: true }
    : { text: sentence, mono: false }
}

/** 番号を持つ段で走っているときだけ「（本 2/4 段）」を添える。 */
function phaseRangeSuffix(phase: WorkPhase): string {
  if (phase.kind !== "phase") {
    return ""
  }
  const text = phaseNumberText(phasePosition(phase))
  return text === "" ? "" : `（${text} 段）`
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
