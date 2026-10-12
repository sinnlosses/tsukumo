// 反応の行の問い合わせの指示文・依頼の文面・出力の形（JSON Schema）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格と表情の選択肢だけで、暦・迎え方・直近の挨拶と、会話から導いたものを入れない。

import { fromKeys, isPlainObject } from "remeda"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import {
  type ReactionLine,
  WRITTEN_REACTION_KINDS,
  type WrittenReactions,
} from "../../../shared/recommendation/reaction.ts"
import type { CheckedAnswer } from "./retried-query.ts"
import type { StructuredQuery } from "./structured-query.ts"
import { WELCOME_GREETING_MODEL, type WelcomeGreetingMaterial } from "./welcome-greeting.ts"
import {
  rejected,
  toExpression,
  toWelcomeLine,
  WELCOME_LINE_REQUESTED_CHARS,
} from "./welcome-line.ts"

export type WrittenReactionsMaterial = Pick<WelcomeGreetingMaterial, "persona" | "expressions">

const WRITTEN_REACTIONS_INSTRUCTION = `あなたはいま、このセッションのあいだ決まった場面で吹き出しに出す一言を書く役目だけを持つ。口調・一人称・相手の呼び方は上の人格のとおりにする。

## 書くもの

あなたがまだ喋れない・もう喋れない場面で吹き出しに出す一言を、場面ごとに \`text\`（一言）と \`expression\`（合う表情を表情の選択肢の名前から1つ）で書く。

- \`retrying\`: 向こう（API）が混んでいて、待ってから呼び直しているあいだ
- \`failed\`: 作業が途中の失敗で止まったとき
- \`limited\`: 利用上限に達して、上限が戻るまで続けられないとき（戻る時刻は画面が出すので書かない）
- \`idle\`: ひと仕事を終えて、利用者の次の依頼を待つ間がしばらく続いたとき

## 書き方

- 4つの \`text\` は、どれも1〜2文、${String(WELCOME_LINE_REQUESTED_CHARS)}字まで、改行を含めない
- 時刻・曜日・季節に合わせず、このセッションのどの時点で出ても通じる一言にする
- 作業の中身は知らないので、中身を推し量って書かない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない`

/** 材料から `query()` に渡すものを組む。人格は指示文の前に置く。 */
export function writtenReactionsQuery(material: WrittenReactionsMaterial): StructuredQuery {
  return {
    model: WELCOME_GREETING_MODEL,
    systemPrompt: [material.persona, WRITTEN_REACTIONS_INSTRUCTION]
      .filter((part) => part.trim() !== "")
      .join("\n\n"),
    prompt: [
      "## 表情の選択肢",
      ...material.expressions.map((choice) => `- ${choice.name}: ${choice.label}`),
    ].join("\n"),
    schema: writtenReactionsSchema(material.expressions),
  }
}

/**
 * 受け取った `structured_output` を検査して反応の行にする。
 * どれか1行でも、空・改行入り・上限超え・差し込み口を持つ・知らない表情・欠けに当たれば、
 * 最初に当たった理由で落とす（何も配らない側に倒す）。
 */
export function parseWrittenReactions(
  value: unknown,
  expressions: readonly ExpressionChoice[],
): CheckedAnswer<WrittenReactions> {
  if (!isPlainObject(value)) {
    return rejected("missing")
  }
  const retrying = toReactionLine(value.retrying, expressions)
  const failed = toReactionLine(value.failed, expressions)
  const limited = toReactionLine(value.limited, expressions)
  const idle = toReactionLine(value.idle, expressions)
  if (retrying.kind === "rejected") {
    return retrying
  }
  if (failed.kind === "rejected") {
    return failed
  }
  if (limited.kind === "rejected") {
    return limited
  }
  if (idle.kind === "rejected") {
    return idle
  }
  return {
    kind: "accepted",
    value: {
      retrying: retrying.value,
      failed: failed.value,
      limited: limited.value,
      idle: idle.value,
    },
  }
}

function writtenReactionsSchema(
  expressions: readonly ExpressionChoice[],
): Readonly<Record<string, unknown>> {
  const reactionLine = {
    type: "object",
    properties: {
      text: { type: "string" },
      expression: { type: "string", enum: expressions.map((choice) => choice.name) },
    },
    required: ["text", "expression"],
    additionalProperties: false,
  }
  return {
    type: "object",
    properties: fromKeys(WRITTEN_REACTION_KINDS, () => reactionLine),
    required: WRITTEN_REACTION_KINDS,
    additionalProperties: false,
  }
}

function toReactionLine(
  value: unknown,
  expressions: readonly ExpressionChoice[],
): CheckedAnswer<ReactionLine> {
  if (!isPlainObject(value)) {
    return rejected("missing")
  }
  const text = toWelcomeLine(value.text, 0)
  const expression = toExpression(value.expression, expressions)
  if (text.kind === "rejected") {
    return text
  }
  if (expression.kind === "rejected") {
    return expression
  }
  return { kind: "accepted", value: { text: text.value, expression: expression.value } }
}
