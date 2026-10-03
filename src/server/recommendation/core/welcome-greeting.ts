// 迎えの挨拶の問い合わせの指示文・依頼の文面・出力の形（JSON Schema）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格・表情の選択肢・暦・直近の挨拶だけで、会話から導いたもの（前のセッションの要約やその有無・タスク一覧）を入れない。

import { isPlainObject } from "remeda"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import {
  WELCOME_GREETING_CARD_MARK,
  type WelcomeGreeting,
} from "../../../shared/recommendation/welcome-greeting.ts"
import type { StructuredQuery } from "./structured-query.ts"

/** 問い合わせを起こすモデル（軽いもの）。 */
export const WELCOME_GREETING_MODEL = "haiku"

/** 挨拶1つの文の上限（文字。差し込み口も数える）。 */
export const WELCOME_GREETING_CHARS = 60

/** 問い合わせ1回の時間切れ（ミリ秒）。 */
export const WELCOME_GREETING_TIMEOUT_MS = 60_000

/** 直近の挨拶として覚えて渡す件数。 */
export const WELCOME_GREETING_RECENT_LIMIT = 5

/** 挨拶の2つの文（表情は覚えない）。 */
export type WelcomeGreetingText = Pick<WelcomeGreeting, "withCard" | "withoutCard">

/** ローカル時刻の暦。`dayOfWeek` は 1（月）〜 7（日）。 */
export type WelcomeCalendar = {
  readonly month: number
  readonly dayOfWeek: number
  readonly hour: number
}

export type WelcomeGreetingMaterial = {
  /** 人格（`persona.md` の全文）。無ければ空文字列。 */
  readonly persona: string
  readonly expressions: readonly ExpressionChoice[]
  readonly calendar: WelcomeCalendar
  /** 直近の挨拶（新しい順）。 */
  readonly recent: readonly WelcomeGreetingText[]
}

const WELCOME_GREETING_INSTRUCTION = `あなたはいま、作業を始めようとしている利用者を迎える挨拶を書く役目だけを持つ。口調・一人称・相手の呼び方は上の人格のとおりにする。

## 書くもの

- \`withCard\`: いちばんのおすすめの始め方（札）があるときの挨拶。札の名前を書く位置に \`${WELCOME_GREETING_CARD_MARK}\` をちょうど1回書く（名前は画面が差し込む。タスクの ID か「前回の続き」が入る）。札を押せばすぐ取りかかれることに触れてよい
- \`withoutCard\`: 札が無いときの挨拶。\`${WELCOME_GREETING_CARD_MARK}\` を書かない
- \`expression\`: 挨拶に合う表情を、表情の選択肢の名前から1つ

## 書き方

- どちらも1〜2文、${String(WELCOME_GREETING_CHARS)}字まで、改行を含めない
- 材料の月・曜日・時刻の帯は、挨拶の手がかりに使ってよい（毎回すべてに触れなくてよい）
- 直近の挨拶と同じ言い回し・同じ書き出しを避け、毎回ちがう印象にする
- 札の中身は知らないので、中身を推し量って書かない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない`

const DAY_OF_WEEK_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const

/** 材料から `query()` に渡すものを組む。人格は指示文の前に置く。 */
export function welcomeGreetingQuery(material: WelcomeGreetingMaterial): StructuredQuery {
  const { calendar } = material
  return {
    model: WELCOME_GREETING_MODEL,
    systemPrompt: [material.persona, WELCOME_GREETING_INSTRUCTION]
      .filter((part) => part.trim() !== "")
      .join("\n\n"),
    prompt: [
      "## 材料",
      `- 月: ${String(calendar.month)}月`,
      `- 曜日: ${DAY_OF_WEEK_LABELS[calendar.dayOfWeek - 1] ?? ""}曜`,
      `- 時刻の帯: ${timeBandOf(calendar.hour)}`,
      "",
      "## 表情の選択肢",
      ...material.expressions.map((choice) => `- ${choice.name}: ${choice.label}`),
      "",
      "## 直近の挨拶（同じ言い回しを避ける）",
      ...(material.recent.length === 0
        ? ["- なし"]
        : material.recent.flatMap((text) => [`- ${text.withCard}`, `- ${text.withoutCard}`])),
    ].join("\n"),
    schema: welcomeGreetingSchema(material.expressions),
  }
}

/**
 * 受け取った `structured_output` を検査して挨拶にする。
 * 空・改行入り・上限超え・差し込み口の数の違い・知らない表情・直近と同じ文のどれかに当たれば `undefined`（何も配らない側に倒す）。
 */
export function parseWelcomeGreeting(
  value: unknown,
  material: Pick<WelcomeGreetingMaterial, "expressions" | "recent">,
): WelcomeGreeting | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const withCard = toSentence(value.withCard)
  const withoutCard = toSentence(value.withoutCard)
  const expression = material.expressions.find((choice) => choice.name === value.expression)
  if (withCard === undefined || withoutCard === undefined || expression === undefined) {
    return undefined
  }
  if (markCount(withCard) !== 1 || markCount(withoutCard) !== 0) {
    return undefined
  }
  const repeated = material.recent.some(
    (text) => text.withCard === withCard || text.withoutCard === withoutCard,
  )
  return repeated ? undefined : { withCard, withoutCard, expression: expression.name }
}

/** 時（0〜23）を時刻の帯の言葉にする。 */
export function timeBandOf(hour: number): string {
  if (hour < 5) {
    return "深夜"
  }
  if (hour < 10) {
    return "朝"
  }
  if (hour < 16) {
    return "昼"
  }
  if (hour < 19) {
    return "夕方"
  }
  return "夜"
}

function welcomeGreetingSchema(
  expressions: readonly ExpressionChoice[],
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties: {
      withCard: { type: "string" },
      withoutCard: { type: "string" },
      expression: { type: "string", enum: expressions.map((choice) => choice.name) },
    },
    required: ["withCard", "withoutCard", "expression"],
    additionalProperties: false,
  }
}

/** 空でない・改行を含まない・{@link WELCOME_GREETING_CHARS} 字以下の1行（前後の空白は落とす）。 */
function toSentence(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" || trimmed.includes("\n") || [...trimmed].length > WELCOME_GREETING_CHARS
    ? undefined
    : trimmed
}

function markCount(text: string): number {
  return text.split(WELCOME_GREETING_CARD_MARK).length - 1
}
