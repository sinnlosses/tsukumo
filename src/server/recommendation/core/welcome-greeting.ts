// 迎えの挨拶の問い合わせの指示文・依頼の文面・出力の形（JSON Schema）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格・表情の選択肢・暦・直近の挨拶・迎え方（続きからなら前回からの経過の帯）だけで、
// 会話から導いたもの（前のセッションの要約・タスク一覧）を入れない。

import { isPlainObject } from "remeda"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import {
  WELCOME_GREETING_CARD_MARK,
  type WelcomeGreeting,
} from "../../../shared/recommendation/welcome-greeting.ts"
import type { CheckedAnswer } from "./retried-query.ts"
import type { StructuredQuery } from "./structured-query.ts"
import {
  rejected,
  toExpression,
  toWelcomeLine,
  WELCOME_LINE_REQUESTED_CHARS,
} from "./welcome-line.ts"

/** 問い合わせを起こすモデル（軽いもの）。 */
export const WELCOME_GREETING_MODEL = "haiku"

/** 書き始め（問い合わせ直しを含めた全体）からの締め切り（ミリ秒）。 */
export const WELCOME_GREETING_TIMEOUT_MS = 15_000

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

/**
 * 前回からの経過の帯の境目。経過がこのミリ秒未満なら、その語にする（上から先に当たったもの）。
 * どれにも当たらなければ {@link LONG_AWAY_BAND}。
 */
export const AWAY_BANDS = [
  { belowMs: 3_600_000, band: "1時間たらず" },
  { belowMs: 21_600_000, band: "数時間" },
  { belowMs: 86_400_000, band: "半日から1日" },
  { belowMs: 604_800_000, band: "数日" },
] as const satisfies readonly { readonly belowMs: number; readonly band: string }[]

const LONG_AWAY_BAND = "1週間以上"

/** 前回の最後の時刻が読めなかったときの帯。 */
export const UNKNOWN_AWAY_BAND = "分からない"

export type AwayBand =
  | (typeof AWAY_BANDS)[number]["band"]
  | typeof LONG_AWAY_BAND
  | typeof UNKNOWN_AWAY_BAND

/** 迎え方。新しく起こした・`/clear` したときは `start`、続きから起こしたときは `resume`。 */
export type WelcomeVisit =
  | { readonly kind: "start" }
  | { readonly kind: "resume"; readonly away: AwayBand }

export const START_VISIT = { kind: "start" } as const satisfies WelcomeVisit

export type WelcomeGreetingMaterial = {
  /** 人格（`persona.md` の全文）。無ければ空文字列。 */
  readonly persona: string
  readonly expressions: readonly ExpressionChoice[]
  readonly calendar: WelcomeCalendar
  readonly visit: WelcomeVisit
  /** 直近の挨拶（新しい順）。 */
  readonly recent: readonly WelcomeGreetingText[]
}

const WELCOME_GREETING_INSTRUCTION = `あなたはいま、作業を始めようとしている利用者を迎える挨拶を書く役目だけを持つ。口調・一人称・相手の呼び方は上の人格のとおりにする。

## 書くもの

- \`withCard\`: いちばんのおすすめの始め方（札）があるときの挨拶。札の名前を書く位置に \`${WELCOME_GREETING_CARD_MARK}\` をちょうど1回書く（名前は画面が差し込む。タスクの ID か「前回の続き」が入る）。札を押せばすぐ取りかかれることに触れてよい
- \`withoutCard\`: 札が無いときの挨拶。\`${WELCOME_GREETING_CARD_MARK}\` を書かない
- \`expression\`: 挨拶に合う表情を、表情の選択肢の名前から1つ

## 書き方

- 挨拶の2つは、どちらも1〜2文、${String(WELCOME_LINE_REQUESTED_CHARS)}字まで、改行を含めない
- 材料の月・曜日・時刻の帯は、挨拶の手がかりに使ってよい（毎回すべてに触れなくてよい）
- 直近の挨拶と同じ言い回し・同じ書き出しを避け、毎回ちがう印象にする
- 札の中身は知らないので、中身を推し量って書かない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない

## 続きから迎えるとき

材料の迎え方が「前回の続きに戻ってきた」なら、挨拶のどちらの文も、前回の作業の続きに戻ってきた利用者へのおかえりとして書く。

- 前回からの経過の帯は手がかりに使ってよい（「分からない」なら触れない）
- 前回に何をしたかは知らないので、中身を推し量って書かない`

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
      ...visitLines(material.visit),
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
 * どれか1つでも、空・改行入り・上限超え・差し込み口の数の違い・知らない表情・欠けに当たるか、
 * 直近と同じ文なら、最初に当たった理由で落とす（何も配らない側に倒す）。
 */
export function parseWelcomeGreeting(
  value: unknown,
  material: Pick<WelcomeGreetingMaterial, "expressions" | "recent">,
): CheckedAnswer<WelcomeGreeting> {
  if (!isPlainObject(value)) {
    return rejected("missing")
  }
  const withCard = toWelcomeLine(value.withCard, 1)
  const withoutCard = toWelcomeLine(value.withoutCard, 0)
  const expression = toExpression(value.expression, material.expressions)
  if (withCard.kind === "rejected") {
    return withCard
  }
  if (withoutCard.kind === "rejected") {
    return withoutCard
  }
  if (expression.kind === "rejected") {
    return expression
  }
  const repeated = material.recent.some(
    (text) => text.withCard === withCard.value || text.withoutCard === withoutCard.value,
  )
  return repeated
    ? rejected("repeated")
    : {
        kind: "accepted",
        value: {
          withCard: withCard.value,
          withoutCard: withoutCard.value,
          expression: expression.value,
        },
      }
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

/** 前回の最後からの経過（ミリ秒）を帯の語にする。 */
export function awayBandOf(elapsedMs: number): AwayBand {
  return AWAY_BANDS.find((entry) => elapsedMs < entry.belowMs)?.band ?? LONG_AWAY_BAND
}

function visitLines(visit: WelcomeVisit): readonly string[] {
  switch (visit.kind) {
    case "start":
      return ["- 迎え方: 新しく始める"]
    case "resume":
      return ["- 迎え方: 前回の続きに戻ってきた", `- 前回から: ${visit.away}`]
  }
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
