// 迎えの挨拶の問い合わせの指示文・依頼の文面・出力の形（zod。JSON Schema はそこから導く）・出力の検査。
// 純関数と定数だけで、`query()` は起こさない。
// 材料は人格・表情の選択肢・暦・直近の挨拶・迎え方（続きからなら前回からの経過の帯）だけで、
// 会話から導いたもの（前のセッションの要約・タスク一覧）を入れない。

import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../shared/diagnostic/welcome-writing.ts"
import {
  WELCOME_GREETING_CARD_MARK,
  type WelcomeGreeting,
} from "../../../shared/recommendation/welcome-greeting.ts"
import type { ModelAlias } from "../../../shared/session/run-setting-value.ts"
import { structuredOutputSchema } from "../../core/query/structured-output-schema.ts"
import type { CheckedAnswer, StructuredQuery } from "../../core/query/structured-query.ts"
import { type AwayBand, type TimeBand, timeBandOf } from "../../core/time-band.ts"
import {
  checkWelcomeAnswer,
  rejected,
  WELCOME_LINE_REQUESTED_CHARS,
  welcomeExpressionSchema,
  welcomeLineSchema,
} from "./welcome-line.ts"

/** 書き始め（問い合わせ直しを含めた全体）からの締め切り（ミリ秒）。 */
export const WELCOME_GREETING_TIMEOUT_MS = 60_000

/** 1回目がこの時間（ミリ秒）経っても返らないときに、2回目を並べて起こす。 */
export const WELCOME_GREETING_HEDGE_MS = 5_000

/** 書けるまで問い合わせる最大の回数。並べて起こすのは1回目と2回目だけ。 */
export const WELCOME_GREETING_MAX_ATTEMPTS = 4

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

/** 前回の最後の時刻が読めなかったときの帯。 */
export const UNKNOWN_AWAY_BAND = "分からない"

/** 迎え方。新しく起こした・`/clear` したときは `start`、続きから起こしたときは `resume`。 */
export type WelcomeVisit =
  | { readonly kind: "start" }
  | { readonly kind: "resume"; readonly away: AwayBand | typeof UNKNOWN_AWAY_BAND }

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

- \`withCard\`: いちばんのおすすめの始め方（カード）があるときの挨拶。カードの名前を書く位置に \`${WELCOME_GREETING_CARD_MARK}\` をちょうど1回書く（名前は画面が差し込む。タスクの ID か「前回の続き」が入る）。カードを押せばすぐ取りかかれることに触れてよい
- \`withoutCard\`: カードが無いときの挨拶。\`${WELCOME_GREETING_CARD_MARK}\` を書かない
- \`expression\`: 挨拶に合う表情を、表情の選択肢の名前から1つ

## 書き方

- 挨拶の2つは、どちらも1〜2文、${String(WELCOME_LINE_REQUESTED_CHARS)}字まで、改行を含めない
- 材料の月・曜日・時間帯は、挨拶の手がかりに使ってよい（毎回すべてに触れなくてよい）
- 直近の挨拶と同じ言い回し・同じ書き出しを避け、毎回ちがう印象にする
- カードの中身は知らないので、中身を推し量って書かない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」など）はしない

## 続きから迎えるとき

材料の迎え方が「前回の続きに戻ってきた」なら、挨拶のどちらの文も、前回の作業の続きに戻ってきた利用者へのおかえりとして書く。

- 前回からの経過時間の区分は手がかりに使ってよい（「分からない」なら触れない）
- 前回に何をしたかは知らないので、中身を推し量って書かない`

const DAY_OF_WEEK_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const

/** 挨拶の材料に書く時刻の帯の語。 */
const TIME_BAND_LABELS = {
  "late-night": "深夜",
  morning: "朝",
  daytime: "昼",
  evening: "夕方",
  night: "夜",
} as const satisfies Record<TimeBand, string>

/** 材料と問い合わせを起こすモデルから `query()` に渡すものを組む。人格は指示文の前に置く。 */
export function welcomeGreetingQuery(
  material: WelcomeGreetingMaterial,
  model: ModelAlias,
): StructuredQuery {
  const { calendar } = material
  return {
    kind: "welcome-greeting",
    images: [],
    model,
    systemPrompt: [material.persona, WELCOME_GREETING_INSTRUCTION]
      .filter((part) => part.trim() !== "")
      .join("\n\n"),
    prompt: [
      "## 材料",
      `- 月: ${String(calendar.month)}月`,
      `- 曜日: ${DAY_OF_WEEK_LABELS[calendar.dayOfWeek - 1] ?? ""}曜`,
      `- 時間帯: ${TIME_BAND_LABELS[timeBandOf(calendar.hour)]}`,
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
    schema: structuredOutputSchema(welcomeGreetingSchema(material.expressions)),
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
): CheckedAnswer<WelcomeGreeting, WelcomeRejection> {
  const checked = checkWelcomeAnswer(welcomeGreetingSchema(material.expressions), value)
  if (checked.kind === "rejected") {
    return checked
  }
  const { withCard, withoutCard } = checked.value
  const repeated = material.recent.some(
    (text) => text.withCard === withCard || text.withoutCard === withoutCard,
  )
  return repeated ? rejected("repeated") : checked
}

function visitLines(visit: WelcomeVisit): readonly string[] {
  switch (visit.kind) {
    case "start":
      return ["- 迎え方: 新しく始める"]
    case "resume":
      return ["- 迎え方: 前回の続きに戻ってきた", `- 前回から: ${visit.away}`]
  }
}

function welcomeGreetingSchema(expressions: readonly ExpressionChoice[]) {
  return z.object({
    withCard: welcomeLineSchema(1),
    withoutCard: welcomeLineSchema(0),
    expression: welcomeExpressionSchema(expressions),
  })
}
