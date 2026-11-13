// 相づちの問い合わせの指示文・依頼の文面・出力の形（zod。JSON Schema はそこから導く）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格と表情の選択肢だけで、会話から導いたものを入れない。

import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../shared/diagnostic/welcome-writing.ts"
import {
  AIZUCHI_PAIRS_PER_MOMENT,
  type AizuchiMoment,
  type AizuchiPairs,
} from "../../../shared/recommendation/aizuchi.ts"
import { structuredOutputSchema } from "../../core/query/structured-output-schema.ts"
import type { CheckedAnswer, StructuredQuery } from "../../core/query/structured-query.ts"
import { WELCOME_GREETING_MODEL, type WelcomeGreetingMaterial } from "./welcome-greeting.ts"
import {
  checkWelcomeAnswer,
  WELCOME_LINE_REQUESTED_CHARS,
  welcomeExpressionSchema,
  welcomeLineSchema,
} from "./welcome-line.ts"

export type WrittenAizuchiMaterial = Pick<WelcomeGreetingMaterial, "persona" | "expressions">

const AIZUCHI_INSTRUCTION = `あなたはいま、立ち絵のそばに出す短い返事の札を書く役目だけを持つ。口調・一人称・相手の呼び方は上の人格のとおりにする。

## 書くもの

利用者が押せる短い一言の札と、押されたときにあなたが返す一言を、場面ごとに${String(AIZUCHI_PAIRS_PER_MOMENT)}組ずつ書く。1組は \`chip\`（利用者の言葉）・\`reply\`（あなたの返事）・\`expression\`（返事に合う表情を表情の選択肢の名前から1つ）。

- \`deliver\`: 作業が済んで、結果を渡したあと
- \`stumble\`: 作業が途中の失敗で止まったあと
- \`work\`: 作業が走っているあいだ

## 書き方

- \`chip\` は短い言葉（「おつかれさま」のような一言）、\`reply\` は1〜2文、どちらも${String(WELCOME_LINE_REQUESTED_CHARS)}字まで、改行を含めない
- 3組は互いに違う言い方にする
- 作業の中身は知らないので、中身を推し量って書かない
- 返事のあとに会話は続かないので、このあと雑談が続くと読める \`chip\` や \`reply\` は書かない
- 時刻・曜日・季節に合わせない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない`

/** 材料から `query()` に渡すものを組む。人格は指示文の前に置く。 */
export function writtenAizuchiQuery(material: WrittenAizuchiMaterial): StructuredQuery {
  return {
    kind: "aizuchi",
    images: [],
    model: WELCOME_GREETING_MODEL,
    systemPrompt: [material.persona, AIZUCHI_INSTRUCTION]
      .filter((part) => part.trim() !== "")
      .join("\n\n"),
    prompt: [
      "## 表情の選択肢",
      ...material.expressions.map((choice) => `- ${choice.name}: ${choice.label}`),
    ].join("\n"),
    schema: structuredOutputSchema(writtenAizuchiSchema(material.expressions)),
  }
}

/**
 * 受け取った `structured_output` を検査して局面ごとの組にする。
 * どれか1組でも、空・改行入り・上限超え・知らない表情・欠けに当たれば、
 * 最初に当たった理由で落とす（何も配らない側に倒す）。
 */
export function parseWrittenAizuchi(
  value: unknown,
  expressions: readonly ExpressionChoice[],
): CheckedAnswer<AizuchiPairs, WelcomeRejection> {
  return checkWelcomeAnswer(writtenAizuchiSchema(expressions), value)
}

function writtenAizuchiSchema(expressions: readonly ExpressionChoice[]) {
  const pair = z.object({
    chip: welcomeLineSchema(0),
    reply: welcomeLineSchema(0),
    expression: welcomeExpressionSchema(expressions),
  })
  const pairs = z.array(pair).length(AIZUCHI_PAIRS_PER_MOMENT, "missing")
  return z.object({ deliver: pairs, stumble: pairs, work: pairs } satisfies Record<
    AizuchiMoment,
    typeof pairs
  >)
}
