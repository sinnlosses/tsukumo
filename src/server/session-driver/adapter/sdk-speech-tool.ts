// セリフを受け取る `speak` ツールと、セリフの引数の形。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionEnumForSpeak,
  expressionGuideForSpeak,
} from "../../../shared/character-pack/expression-choice.ts"
import type { CallReview } from "../core/call-review.ts"
import type { SessionMode } from "../core/session-driver.ts"
import type { SpeechVerdict } from "../core/speech-review.ts"
import { SPEAK_TOOL_NAME } from "../core/tsukumo-tool-name.ts"

/** モデルに見せる `speak` ツールの説明。セリフと本文の境目はここだけで説明する。 */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想はこのツールで言う。" +
  "`report` を呼ぶターンの締めの一言はここではなく `report` の closing に入れる。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。" +
  "委譲先の段を番号で言うセリフでは、その番号を `phase` で申告する。"

/** モデルに見せる `speak` の `phase` 引数の説明。 */
const SPEAK_PHASE_DESCRIPTION =
  "セリフが委譲先の段を番号で言うとき（「段2が返った」など）、その段の番号（1から委譲先の段の数まで。`phase_result` の `phase` と同じ数え方）。" +
  "委譲の範囲があるあいだ、範囲の外の番号は差し戻される。" +
  "段を番号で言わないセリフと、計画・受け入れのような範囲の外の段（名前で言う）では省く"

/** セリフを受け取るツール。差し戻すかは仕事のときだけ `CallReview` が決める。 */
export function speakTool(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  review: CallReview,
) {
  return tool(
    SPEAK_TOOL_NAME,
    SPEAK_TOOL_DESCRIPTION,
    {
      ...speechShape(expressions),
      // 0 や負の数も形では通し、範囲の検査の差し戻しで直し方を返す。
      phase: z.number().int().optional().describe(SPEAK_PHASE_DESCRIPTION),
    },
    async ({ phase }) => {
      const mention =
        mode.kind === "work" && phase !== undefined
          ? review.judgePhaseMention(phase)
          : ACCEPTED_SPEECH
      const verdict = mode.kind === "work" ? review.judgeSpeak() : ACCEPTED_SPEECH
      const rejection = mention.kind === "rejected" ? mention : verdict
      return rejection.kind === "rejected"
        ? { content: [{ type: "text" as const, text: rejection.text }], isError: true }
        : { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

const ACCEPTED_SPEECH = { kind: "accepted" } as const satisfies SpeechVerdict

/** セリフの引数の形（`speak` と `report` の `closing`・`waitingLine` で同じ）。 */
export function speechShape(expressions: readonly ExpressionChoice[]) {
  return {
    text: z.string().describe("セリフ。1〜2文の短い一言"),
    expression: z
      .enum(expressionEnumForSpeak(expressions))
      .describe(expressionGuideForSpeak(expressions)),
  }
}
