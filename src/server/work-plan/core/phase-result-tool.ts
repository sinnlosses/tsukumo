// `phase_result` ツール（委譲先が段の結果を返す構造化した返却）の説明文と、handler が返す文と、メインの呼び出しを拒む判定。
// ツールは仕事のときだけ載る。引数と帯の動かし方の正典は `docs/architecture/workflow-contract.md`「スキルの契約」。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ToolVerdict } from "../../core/tool-verdict.ts"
import { PHASE_RESULT_TOOL_NAME, tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"
import { bandPositionText } from "./band-position.ts"
import type { WorkPlanReview } from "./work-plan-review.ts"

/** モデルに見せる `phase_result` ツールの説明。 */
export const PHASE_RESULT_TOOL_DESCRIPTION =
  "委譲先としてフェーズを1つ終えたとき、SubagentHandback の前に1回呼び、その結果を返す。" +
  "tsukumo が進み具合のプログレスバーを進める。結果の中身（したこと・分かったこと）は返さず、タスクの置き場に書く。" +
  "プログレスバーの中間レポートに出すフェーズのまとめだけは summary に1〜2文で渡せる（渡したフェーズは、メインの work_plan の phaseSummary が要らない）。" +
  "メイン（委譲していない側）は呼ばない（work_plan で進める）。"

export const PHASE_RESULT_STEP_DESCRIPTION =
  "結果を返すフェーズの id（work_plan の phases の段の id）。ワークフロースクリプトの agent が省くと、その agent のフェーズで補われる"

export const PHASE_RESULT_PHASE_DESCRIPTION =
  "結果を返すフェーズの番号（1始まり）。委譲先の並びの中の番号で、count 以下。count と一緒に渡す。step を渡すときは省く（互換の欄）"

export const PHASE_RESULT_COUNT_DESCRIPTION =
  "委譲先のフェーズの数。phase と一緒に渡す。step を渡すときは省く（互換の欄）"

export const PHASE_RESULT_OUTCOME_DESCRIPTION =
  "finished（済ませた）・skipped（要らず飛ばした）・stopped（途中で止めた。reason を添える）"

export const PHASE_RESULT_REASON_DESCRIPTION =
  "止めた理由を1〜2文で。outcome が stopped のときだけ渡し、ほかでは省く"

export const PHASE_RESULT_SUMMARY_DESCRIPTION =
  "フェーズのまとめを1〜2文で（プログレスバーの中間レポートに出る）。outcome が finished のときだけ渡し、ほかでは省く"

/** 差し戻しの種類ごとの直し方。 */
const PHASE_RESULT_REJECTIONS = {
  malformed:
    "phase と count は両方渡すか両方省き、渡すなら phase は 1 から count までの整数にする。outcome は finished・skipped・stopped のどれかにする。" +
    "reason は outcome が stopped のときだけ、空でない文で渡す。summary は outcome が finished のときだけ渡す。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  outOfOrder:
    "phase は今のフェーズの番号にする。済んだフェーズへの戻りと、先のフェーズへの飛ばしは受け付けない。" +
    "今のフェーズを済ませてから、次のフェーズの結果を返すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  unknownStep:
    "step は work_plan の phases の段の id にする。並びに無い id は受け付けない。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  main:
    "phase_result は委譲先がフェーズの結果を返すツールで、メインは呼ばない。" +
    "メインで走るフェーズは work_plan で進め、飛ばしたものは skippedPhases に入れる。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
} as const

const BAND_UNMOVED_TEXT = "プログレスバーは動いていない。"

/** `phase_result` の handler が返す文と、差し戻したか。 */
export type PhaseResultAnswer = { readonly text: string; readonly isError: boolean }

/**
 * `phase_result` の呼び出し1つを判定して返す文を決める。
 * 帯を動かしたときだけ、結果を読んだ形の `delegate-returned` を `onEvent` で流す（`CallReview.pass` は通さず、委譲ゲートは立てない）。
 */
export function answerPhaseResultCall(
  review: { readonly judgePhaseResult: WorkPlanReview["judgeResult"] },
  input: unknown,
  onEvent: (event: SessionEvent) => void,
): PhaseResultAnswer {
  const verdict = review.judgePhaseResult(input)
  if (verdict.kind === "out-of-order") {
    return { text: PHASE_RESULT_REJECTIONS.outOfOrder, isError: true }
  }
  if (verdict.kind === "unknown-step") {
    return { text: PHASE_RESULT_REJECTIONS.unknownStep, isError: true }
  }
  if (verdict.kind !== "accepted") {
    return { text: PHASE_RESULT_REJECTIONS.malformed, isError: true }
  }
  if (verdict.moved) {
    onEvent({ kind: "delegate-returned", handback: verdict.handback })
  }
  const position = bandPositionText(verdict.plan)
  return {
    text: `ok\n${verdict.moved ? position : `${BAND_UNMOVED_TEXT}${position}`}`,
    isError: false,
  }
}

/** `PreToolUse` に届いた `phase_result` の呼び出し1つ。`agentId` はサブエージェントの中の呼び出しだけが持つ。 */
export type PhaseResultCaller = {
  readonly toolName: string
  readonly agentId?: string
  readonly toolInput: unknown
  /** ワークフロースクリプトの写しで、この agent がいる段の題（`WorkPlanReview.workflowAgentPhase`）。 */
  readonly workflowAgentPhase: WorkPlanReview["workflowAgentPhase"]
  /** いまのワークプランの `phaseIds`。ワークプランが無ければ空。 */
  readonly phaseIds: readonly string[]
}

/**
 * `PreToolUse` で、`phase_result` の呼び出しを通すか・拒むか・入力に `step` を補って通すか。
 * メインの呼び出しは拒む。
 * サブエージェントの呼び出しで、入力に `step` も `phase` も無く、その agent の段の題が `phaseIds` にあれば、その題を `step` に補う。
 * `phase` を持つ呼び出しに補わないのは、ワークフロースクリプトの agent が自分の段と別の段を `phase` で返すことがあるため。
 * ほかのツールとほかの呼び出しは通す。
 */
export function judgePhaseResultCaller(caller: PhaseResultCaller): ToolVerdict {
  if (caller.toolName !== tsukumoToolFullName(PHASE_RESULT_TOOL_NAME)) {
    return { kind: "allow" }
  }
  if (caller.agentId === undefined) {
    return { kind: "deny", reason: PHASE_RESULT_REJECTIONS.main }
  }
  const input = caller.toolInput
  if (typeof input !== "object" || input === null || "step" in input || "phase" in input) {
    return { kind: "allow" }
  }
  const step = caller.workflowAgentPhase(caller.agentId)
  return step !== undefined && caller.phaseIds.includes(step)
    ? { kind: "rewrite", input: { ...input, step } }
    : { kind: "allow" }
}
