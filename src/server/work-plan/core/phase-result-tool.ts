// `phase_result` ツール（委譲先が段の結果を返す構造化した返却）の説明文と、handler が返す文と、メインの呼び出しを拒む判定。
// ツールは仕事のときだけ載る。引数と帯の動かし方の正典は `docs/architecture/workflow-contract.md`「スキルの契約」。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { PHASE_RESULT_TOOL_NAME, tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"
import { bandPositionText } from "./band-position.ts"
import type { GateVerdict } from "./work-plan-gate.ts"
import type { WorkPlanReview } from "./work-plan-review.ts"

/** モデルに見せる `phase_result` ツールの説明。 */
export const PHASE_RESULT_TOOL_DESCRIPTION =
  "委譲先として段を1つ終えたとき、SubagentHandback の前に1回呼び、段の結果を返す。" +
  "tsukumo が進み具合の帯を進める。結果の中身（したこと・分かったこと）は返さず、タスクの置き場に書く。" +
  "メイン（委譲していない側）は呼ばない（段は work_plan で進める）。"

export const PHASE_RESULT_PHASE_DESCRIPTION =
  "結果を返す段の番号（1始まり）。委譲先の段の並びの中の番号で、count 以下"

export const PHASE_RESULT_COUNT_DESCRIPTION = "委譲先の段の数"

export const PHASE_RESULT_OUTCOME_DESCRIPTION =
  "finished（段を済ませた）・skipped（この段が要らず飛ばした）・stopped（段の途中で止めた。reason を添える）"

export const PHASE_RESULT_REASON_DESCRIPTION =
  "止めた理由を1〜2文で。outcome が stopped のときだけ渡し、ほかでは省く"

/** 差し戻しの種類ごとの直し方。 */
const PHASE_RESULT_REJECTIONS = {
  malformed:
    "phase は 1 から count までの整数にし、outcome は finished・skipped・stopped のどれかにする。" +
    "reason は outcome が stopped のときだけ、空でない文で渡す。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  main:
    "phase_result は委譲先が段の結果を返すツールで、メインは呼ばない。" +
    "メインで走る段は work_plan で進め、飛ばした段は skippedPhases に入れる。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
} as const

const BAND_UNMOVED_TEXT = "帯は動いていない。"

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

/** `PreToolUse` で、メインの `phase_result` を拒むか。サブエージェントの中の呼び出しとほかのツールは通す。 */
export function judgePhaseResultCaller(toolName: string, inSubagent: boolean): GateVerdict {
  return !inSubagent && toolName === tsukumoToolFullName(PHASE_RESULT_TOOL_NAME)
    ? { kind: "deny", reason: PHASE_RESULT_REJECTIONS.main }
    : { kind: "allow" }
}
