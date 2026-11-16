// 広い画面の流れの末尾の行の文。していること（動詞）・対象・経過・長く掛かっているときの添え書きで言う。
// 動詞の表は ADR 0062 の「末尾の行（いまの行）の文」が正。狭い画面の1行は `workActivityOf` が別に持つ。

import { isPlainObject } from "remeda"

import { recordTimeAt } from "../../../../../../../shared/session/session-record.ts"
import { formatElapsed } from "../../../../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../../../../domain/tool-summary.ts"
import { backgroundSummaryLabel } from "../../../../../../features/current-work/current-work-step.ts"
import { apiRetryNotice } from "../../../domain/api-error-label.ts"
import { isSlashClear } from "../../../domain/slash-clear.ts"
import {
  currentRequestTextOf,
  latestSteppedBackground,
  workflowThinking,
  type WorkActivitySource,
} from "./work-activity.ts"

const DELEGATING = "委譲先に任せている"

const NOW_LINE_VERBS: Readonly<Record<string, string>> = {
  Read: "読んでいる",
  Grep: "探している",
  Glob: "探している",
  Edit: "書き換えている",
  MultiEdit: "書き換えている",
  NotebookEdit: "書き換えている",
  Write: "書いている",
  Bash: "コマンドを走らせている",
  Agent: DELEGATING,
  Task: DELEGATING,
  WebFetch: "調べている",
  WebSearch: "調べている",
}

const UNKNOWN_TOOL_VERB = "道具を使っている"
const BACKGROUND_PREFIX = "背景で"

/** 同じ状態がこの秒数を超えたら「長く掛かっている」を添える。 */
const LONG_RUNNING_SECONDS = 120
const LONG_RUNNING_REMARK = "長く掛かっている"

export type NowLineStatement =
  | { readonly kind: "asking" }
  | {
      readonly kind: "doing"
      readonly verb: string
      readonly target: string
      /** 対象を等幅で組むか（道具の入力の要約と道具の名前）。 */
      readonly mono: boolean
      readonly elapsed: string
      readonly remark: string
      readonly longRunning: boolean
      /** 再試行中の理由と待ち時間（`title` で読ませる）。再試行中でなければ空。 */
      readonly retryDetail: string
    }

type Doing = Extract<NowLineStatement, { readonly kind: "doing" }>

const PLAIN = {
  target: "",
  mono: false,
  elapsed: "",
  remark: "",
  longRunning: false,
  retryDetail: "",
} satisfies Omit<Doing, "kind" | "verb">

/**
 * 強い順に1つ: 答え待ち → API の再試行中 → report を書いている途中 → 走っている手順 →
 * 手順を持つバックグラウンドタスク（いちばん新しく手順が始まったもの）→ 手順を持たないバックグラウンドタスク →
 * 考えている（依頼が会話の片付けのときは「会話を片付けている」）。
 */
export function nowLineStatementOf(source: WorkActivitySource): NowLineStatement {
  const { turnStepList, now } = source
  if (source.firstPending !== undefined) {
    return { kind: "asking" }
  }
  if (source.turn.kind === "running" && source.apiTrouble.kind === "retrying") {
    return {
      kind: "doing",
      ...PLAIN,
      verb: "もう一度試している",
      target: `API の応答待ち · ${String(source.apiTrouble.attempt)}回目`,
      retryDetail: apiRetryNotice(source.apiTrouble).detail,
    }
  }
  if (source.reportDrafting.kind === "drafting") {
    return { kind: "doing", ...PLAIN, verb: "レポートを書いている" }
  }
  const running = turnStepList.steps.findLast((step) => step.status.kind === "running")
  if (running !== undefined) {
    const startedAt = recordTimeAt(running.startedAt)
    return toolStatement({
      name: running.name,
      input: running.input,
      ...(startedAt === undefined ? {} : { startedAt }),
      now,
      prefix: "",
    })
  }
  const stepped = latestSteppedBackground({
    backgroundTasks: source.backgroundTasks,
    workflowSteps: source.workflowSteps,
    steps: turnStepList.steps,
  })
  if (stepped?.kind === "agent") {
    const delegation = turnStepList.steps.findLast(
      (step) => step.name === "Agent" || step.name === "Task",
    )
    const description = source.backgroundTasks.findLast((task) => task.kind === "agent")
    return {
      kind: "doing",
      ...PLAIN,
      verb: `${BACKGROUND_PREFIX} ${DELEGATING}`,
      target:
        delegation === undefined
          ? (description?.description ?? "")
          : delegationTarget(delegation.input),
    }
  }
  if (stepped !== undefined) {
    const { step } = stepped
    if (step.running) {
      return toolStatement({
        name: step.name,
        input: step.input,
        startedAt: step.startedAt,
        now,
        prefix: BACKGROUND_PREFIX,
      })
    }
    const agent = source.workflowProgress
      .find((progress) => progress.taskId === stepped.taskId)
      ?.agents.findLast(
        (candidate) => candidate.state === "start" || candidate.state === "progress",
      )
    if (agent !== undefined && workflowThinking(source.workflowProgress, stepped.taskId)) {
      return {
        kind: "doing",
        ...PLAIN,
        verb: `${BACKGROUND_PREFIX} ${DELEGATING}`,
        target: agent.phaseTitle,
      }
    }
  }
  const background = backgroundSummaryLabel(source.backgroundTasks)
  if (background !== undefined) {
    return { kind: "doing", ...PLAIN, verb: BACKGROUND_PREFIX, target: background }
  }
  return {
    kind: "doing",
    ...PLAIN,
    verb: isSlashClear(currentRequestTextOf(source.records)) ? "会話を片付けている" : "考えている",
  }
}

function toolStatement(tool: {
  readonly name: string
  readonly input: unknown
  readonly startedAt?: number
  readonly now: number
  readonly prefix: string
}): Doing {
  const { name, input, startedAt, now, prefix } = tool
  const known = NOW_LINE_VERBS[name]
  const verb = known ?? UNKNOWN_TOOL_VERB
  const seconds =
    startedAt === undefined ? undefined : Math.max(0, Math.floor((now - startedAt) / 1000))
  const delegating = verb === DELEGATING
  const longRunning = !delegating && seconds !== undefined && seconds > LONG_RUNNING_SECONDS
  return {
    kind: "doing",
    verb: prefix === "" ? verb : `${prefix} ${verb}`,
    target: delegating
      ? delegationTarget(input)
      : known === undefined
        ? name
        : summarizeToolInput(name, input),
    mono: !delegating,
    elapsed: seconds === undefined ? "" : formatElapsed(seconds),
    remark: longRunning ? LONG_RUNNING_REMARK : "",
    longRunning,
    retryDetail: "",
  }
}

/** 委譲先の役（`subagent_type`）と説明（`description`）。無い欄は飛ばす。 */
function delegationTarget(input: unknown): string {
  if (!isPlainObject(input)) {
    return ""
  }
  return [input["subagent_type"], input["description"]]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ")
}
