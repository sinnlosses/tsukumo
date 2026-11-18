// 反応の行の問い合わせの指示文・依頼の文面・出力の形（zod。JSON Schema はそこから導く）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格と表情の選択肢だけで、暦・迎え方・直近の挨拶と、会話から導いたものを入れない。

import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../shared/diagnostic/welcome-writing.ts"
import {
  type MarkedReactionKind,
  REACTION_MARKS,
  type WrittenReactions,
} from "../../../shared/recommendation/reaction.ts"
import { structuredOutputSchema } from "../../core/query/structured-output-schema.ts"
import type { CheckedAnswer, StructuredQuery } from "../../core/query/structured-query.ts"
import { WELCOME_GREETING_MODEL, type WelcomeGreetingMaterial } from "./welcome-greeting.ts"
import {
  checkWelcomeAnswer,
  WELCOME_LINE_REQUESTED_CHARS,
  welcomeExpressionSchema,
  welcomeLineSchema,
} from "./welcome-line.ts"

export type WrittenReactionsMaterial = Pick<WelcomeGreetingMaterial, "persona" | "expressions">

const WRITTEN_REACTIONS_INSTRUCTION = `あなたはいま、このセッションのあいだ決まった場面で吹き出しに出す一言を書く役目だけを持つ。口調・一人称・相手の呼び方は上の人格のとおりにする。

## 書くもの

あなたがまだ喋れない・もう喋れない場面で吹き出しに出す一言を、場面ごとに \`text\`（一言）と \`expression\`（合う表情を表情の選択肢の名前から1つ）で書く。

- \`retrying\`: 向こう（API）が混んでいて、待ってから呼び直しているあいだ
- \`failed\`: 作業が途中の失敗で止まったとき
- \`limited\`: 利用上限に達して、上限が戻るまで続けられないとき
- \`idle\`: ひと仕事を終えて、利用者の次の依頼を待つ間がしばらく続いたとき

\`failed\` は \`text\` の1文だけ書く。\`retrying\`・\`limited\`・\`idle\` は、印を1つ持つ文 \`withMark\` と、印の無い文 \`withoutMark\` の両方を書く。印には画面が事実を差し込む（事実を自分で書かない）。

- \`retrying\` の印 \`${REACTION_MARKS.retrying}\`: 何回目の呼び直しか（数）
- \`limited\` の印 \`${REACTION_MARKS.limited}\`: 上限が戻る時刻
- \`idle\` の印 \`${REACTION_MARKS.idle}\`: 次に着手できるタスクの名前

\`withMark\` は印をちょうど1つ、\`withoutMark\` は印を含めない。値が分からないときは \`withoutMark\` が出るので、どちらも単独で通じる一言にする。

## 書き方

- 書く文は、どれも1〜2文、${String(WELCOME_LINE_REQUESTED_CHARS)}字まで（印も数える）、改行を含めない
- 時刻・曜日・季節に合わせず、このセッションのどの時点で出ても通じる一言にする
- 作業の中身は知らないので、中身を推し量って書かない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない`

/** 材料から `query()` に渡すものを組む。人格は指示文の前に置く。 */
export function writtenReactionsQuery(material: WrittenReactionsMaterial): StructuredQuery {
  return {
    kind: "welcome-reactions",
    images: [],
    model: WELCOME_GREETING_MODEL,
    systemPrompt: [material.persona, WRITTEN_REACTIONS_INSTRUCTION]
      .filter((part) => part.trim() !== "")
      .join("\n\n"),
    prompt: [
      "## 表情の選択肢",
      ...material.expressions.map((choice) => `- ${choice.name}: ${choice.label}`),
    ].join("\n"),
    schema: structuredOutputSchema(writtenReactionsSchema(material.expressions)),
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
): CheckedAnswer<WrittenReactions, WelcomeRejection> {
  return checkWelcomeAnswer(writtenReactionsSchema(expressions), value)
}

function writtenReactionsSchema(expressions: readonly ExpressionChoice[]) {
  const expression = welcomeExpressionSchema(expressions)
  const plainLine = z.object({ text: welcomeLineSchema(0), expression })
  const markedLine = (kind: MarkedReactionKind) =>
    z.object({
      withMark: welcomeLineSchema(1, REACTION_MARKS[kind]),
      withoutMark: welcomeLineSchema(0, REACTION_MARKS[kind]),
      expression,
    })
  return z.object({
    retrying: markedLine("retrying"),
    failed: plainLine,
    limited: markedLine("limited"),
    idle: markedLine("idle"),
  })
}
