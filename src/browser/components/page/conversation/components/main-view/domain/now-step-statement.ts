// プログレスバーのいまの手順の一文。道具の手順は対象だけ、それ以外は「対象 に 動詞」か動詞だけの敬体で、手順の秒と添え書きを添える。
// 動詞の表は ADR 0062 の「末尾の行（いまの行）の文」と ADR 0070 の論点 2 が正。狭い画面の1行は `workActivityOf` が別に持つ。

import { isPlainObject } from "remeda"

import { recordTimeAt } from "../../../../../../../shared/session/session-record.ts"
import { hookedAgents } from "../../../../../../../shared/session/workflow-step.ts"
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

const DELEGATING = { particle: "に", verb: "任せています" }
const FALLBACK_DELEGATE = "委譲先"

// 道具の手順は対象（入力の要約）だけを出し、動詞は対象が引けないときにだけ言う。
const NOW_STEP_VERBS: Readonly<Record<string, string>> = {
  Read: "読んでいます",
  Grep: "探しています",
  Glob: "探しています",
  Edit: "書き換えています",
  MultiEdit: "書き換えています",
  NotebookEdit: "書き換えています",
  Write: "書いています",
  Bash: "走らせています",
  WebFetch: "調べています",
  WebSearch: "調べています",
}

export type NowStepStatement =
  | { readonly kind: "asking" }
  | {
      readonly kind: "doing"
      /** 道具の手順なら道具の名前（文に出さず、手順の替わり目を見分ける）。道具でなければ空。 */
      readonly tool: string
      readonly target: string
      /** 対象のあとのつなぎ（「を」「に」）。対象が無ければ空。 */
      readonly particle: string
      readonly verb: string
      /** 対象を等幅で組むか（道具の入力の要約と道具の名前）。 */
      readonly mono: boolean
      readonly elapsed: string
      /** 幅が足りないとき先に譲る添え書き（委譲の説明・再試行の回数）。 */
      readonly aside: string
      /** 再試行中の理由と待ち時間（`title` で読ませる）。再試行中でなければ空。 */
      readonly retryDetail: string
    }

export type Doing = Extract<NowStepStatement, { readonly kind: "doing" }>

const PLAIN = {
  tool: "",
  target: "",
  particle: "",
  mono: false,
  elapsed: "",
  aside: "",
  retryDetail: "",
} satisfies Omit<Doing, "kind" | "verb">

/**
 * 強い順に1つ: 答え待ち → API の再試行中 → report を書いている途中 → 走っている手順 →
 * 手順を持つバックグラウンドタスク（いちばん新しく手順が始まったもの）→ 手順を持たないバックグラウンドタスク →
 * 考えている（依頼が会話の片付けのときは「会話を片付けている」）。
 */
export function nowStepStatementOf(source: WorkActivitySource): NowStepStatement {
  const { turnStepList, now } = source
  if (source.firstPending !== undefined) {
    return { kind: "asking" }
  }
  if (source.turn.kind === "running" && source.apiTrouble.kind === "retrying") {
    return {
      kind: "doing",
      ...PLAIN,
      target: "API の応答",
      particle: "を",
      verb: "待っています",
      aside: `${String(source.apiTrouble.attempt)}回目の再試行`,
      retryDetail: apiRetryNotice(source.apiTrouble).detail,
    }
  }
  if (source.reportDrafting.kind === "drafting") {
    return { kind: "doing", ...PLAIN, verb: "レポートを書いています" }
  }
  const running = turnStepList.steps.findLast((step) => step.status.kind === "running")
  if (running !== undefined) {
    const startedAt = recordTimeAt(running.startedAt)
    return toolStatement({
      name: running.name,
      input: running.input,
      ...(startedAt === undefined ? {} : { startedAt }),
      now,
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
    return delegationStatement(
      delegation === undefined
        ? { role: "", description: description?.description ?? "" }
        : delegationOf(delegation.input),
    )
  }
  if (stepped !== undefined) {
    const { step } = stepped
    if (step.running) {
      return toolStatement({
        name: step.name,
        input: step.input,
        startedAt: step.startedAt,
        now,
      })
    }
    const progress = source.workflowProgress.find(
      (candidate) => candidate.taskId === stepped.taskId,
    )
    const agent =
      progress === undefined
        ? undefined
        : hookedAgents(progress).findLast(
            (candidate) => candidate.state === "start" || candidate.state === "progress",
          )
    if (agent !== undefined && workflowThinking(source.workflowProgress, stepped.taskId)) {
      return {
        kind: "doing",
        ...PLAIN,
        target: agent.phaseTitle,
        particle: "を",
        verb: "進めています",
      }
    }
  }
  const background = backgroundSummaryLabel(source.backgroundTasks)
  if (background !== undefined) {
    return {
      kind: "doing",
      ...PLAIN,
      target: background,
      verb: "",
    }
  }
  return {
    kind: "doing",
    ...PLAIN,
    verb: isSlashClear(currentRequestTextOf(source.records))
      ? "会話を片付けています"
      : "考えています",
  }
}

/** 文の鍵。手順が替わったかを言う。秒と添え書きは含めない。 */
export function nowStepKeyOf(doing: Doing): string {
  return [doing.tool, doing.target, doing.particle, doing.verb].join("\u0000")
}

/**
 * 対象を、縮めてよい頭と縮めない最後の語に分ける。
 * 等幅の対象は、最後の空白の後ろ、空白が無ければ最後の `/` の後ろを最後の語にする。
 * 空白で分けたとき空白は頭にも最後の語にも含めず、`/` で分けたとき `/` は頭に残す。
 */
export function targetPartsOf(
  target: string,
  mono: boolean,
): { readonly head: string; readonly tail: string } {
  const whole = { head: target, tail: "" }
  if (!mono) {
    return whole
  }
  const space = target.lastIndexOf(" ")
  if (space >= 0) {
    return space === 0 || space === target.length - 1
      ? whole
      : { head: target.slice(0, space), tail: target.slice(space + 1) }
  }
  const slash = target.lastIndexOf("/")
  return slash < 0 || slash === target.length - 1
    ? whole
    : { head: target.slice(0, slash + 1), tail: target.slice(slash + 1) }
}

function toolStatement(tool: {
  readonly name: string
  readonly input: unknown
  readonly startedAt?: number
  readonly now: number
}): Doing {
  const { name, input, startedAt, now } = tool
  const seconds =
    startedAt === undefined ? undefined : Math.max(0, Math.floor((now - startedAt) / 1000))
  const elapsed = seconds === undefined ? "" : formatElapsed(seconds)
  if (name === "Agent" || name === "Task") {
    return { ...delegationStatement(delegationOf(input)), elapsed }
  }
  const known = NOW_STEP_VERBS[name]
  const target = known === undefined ? name : summarizeToolInput(name, input)
  return {
    ...PLAIN,
    kind: "doing",
    tool: name,
    target,
    verb: target === "" ? (known ?? "") : "",
    mono: target !== "",
    elapsed,
  }
}

function delegationStatement(delegation: {
  readonly role: string
  readonly description: string
}): Doing {
  return {
    ...PLAIN,
    kind: "doing",
    target: delegation.role === "" ? FALLBACK_DELEGATE : delegation.role,
    particle: DELEGATING.particle,
    verb: DELEGATING.verb,
    aside: delegation.description,
  }
}

/** 委譲先の役（`subagent_type` の綴りのまま）と説明（`description`）。無い欄は空。 */
function delegationOf(input: unknown): { readonly role: string; readonly description: string } {
  if (!isPlainObject(input)) {
    return { role: "", description: "" }
  }
  const role = input["subagent_type"]
  const description = input["description"]
  return {
    role: typeof role === "string" ? role : "",
    description: typeof description === "string" ? description : "",
  }
}
