// 広い画面の流れの末尾の行の文。「対象 を 動詞」の敬体で、手順の秒と添え書きを添える。
// 動詞の表は ADR 0062 の「末尾の行（いまの行）の文」と ADR 0070 の論点 2 が正。狭い画面の1行は `workActivityOf` が別に持つ。

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

const DELEGATING = { particle: "に", verb: "任せています" }
const FALLBACK_DELEGATE = "委譲先"

const NOW_LINE_VERBS: Readonly<
  Record<string, { readonly particle: string; readonly verb: string }>
> = {
  Read: { particle: "を", verb: "読んでいます" },
  Grep: { particle: "を", verb: "探しています" },
  Glob: { particle: "を", verb: "探しています" },
  Edit: { particle: "を", verb: "書き換えています" },
  MultiEdit: { particle: "を", verb: "書き換えています" },
  NotebookEdit: { particle: "を", verb: "書き換えています" },
  Write: { particle: "を", verb: "書いています" },
  Bash: { particle: "を", verb: "走らせています" },
  WebFetch: { particle: "を", verb: "調べています" },
  WebSearch: { particle: "を", verb: "調べています" },
}

const UNKNOWN_TOOL = { particle: "を", verb: "使っています" }
const BACKGROUND_LEAD = "背景で"

export type NowLineStatement =
  | { readonly kind: "asking" }
  | {
      readonly kind: "doing"
      /** 対象の前に置く語（「背景で」）。無ければ空。 */
      readonly lead: string
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

type Doing = Extract<NowLineStatement, { readonly kind: "doing" }>

const PLAIN = {
  lead: "",
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
export function nowLineStatementOf(source: WorkActivitySource): NowLineStatement {
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
      lead: "",
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
      BACKGROUND_LEAD,
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
        lead: BACKGROUND_LEAD,
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
        lead: BACKGROUND_LEAD,
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
      lead: BACKGROUND_LEAD,
      target: background,
      particle: "を",
      verb: "走らせています",
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

function toolStatement(tool: {
  readonly name: string
  readonly input: unknown
  readonly startedAt?: number
  readonly now: number
  readonly lead: string
}): Doing {
  const { name, input, startedAt, now, lead } = tool
  const seconds =
    startedAt === undefined ? undefined : Math.max(0, Math.floor((now - startedAt) / 1000))
  const elapsed = seconds === undefined ? "" : formatElapsed(seconds)
  if (name === "Agent" || name === "Task") {
    return { ...delegationStatement(lead, delegationOf(input)), elapsed }
  }
  const known = NOW_LINE_VERBS[name]
  const wording = known ?? UNKNOWN_TOOL
  const target = known === undefined ? name : summarizeToolInput(name, input)
  return {
    ...PLAIN,
    kind: "doing",
    lead,
    target,
    particle: target === "" ? "" : wording.particle,
    verb: wording.verb,
    mono: target !== "",
    elapsed,
  }
}

function delegationStatement(
  lead: string,
  delegation: { readonly role: string; readonly description: string },
): Doing {
  return {
    ...PLAIN,
    kind: "doing",
    lead,
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
