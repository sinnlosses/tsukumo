// 迎えの書き手が書かせる1行（挨拶の文と反応の行）の字数と、受け取った欄の形。純関数と定数だけ。

import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames,
} from "../../../shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../shared/diagnostic/welcome-writing.ts"
import { WELCOME_GREETING_CARD_MARK } from "../../../shared/recommendation/welcome-greeting.ts"
import type { CheckedAnswer } from "../../core/structured-query.ts"

/** 1行を検査する上限（文字。差し込み口も数える）。 */
const WELCOME_LINE_CHARS = 60

/** 指示文で頼む1行の字数（検査の上限 {@link WELCOME_LINE_CHARS} より短い）。 */
export const WELCOME_LINE_REQUESTED_CHARS = 50

/** 検査の message に理由の名前をそのまま置く検査（型の違いは zod の issue の種類から引く）。 */
const CHECK_REJECTIONS = [
  "empty",
  "newline",
  "too-long",
  "mark-count",
  "unknown-expression",
  "missing",
] as const satisfies readonly WelcomeRejection[]

/**
 * 空でない・改行を含まない・{@link WELCOME_LINE_CHARS} 字以下で、差し込み口をちょうど `marks` 個持つ1行
 * （前後の空白は落とす）。検査はこの順に当たり、最初に落ちたものが理由になる。
 */
export function welcomeLineSchema(marks: number) {
  return z
    .string()
    .trim()
    .min(1, "empty")
    .refine((line) => !line.includes("\n"), "newline")
    .max(WELCOME_LINE_CHARS, "too-long")
    .refine((line) => line.split(WELCOME_GREETING_CARD_MARK).length - 1 === marks, "mark-count")
}

/** 表情の選択肢にある名前。 */
export function welcomeExpressionSchema(expressions: readonly ExpressionChoice[]) {
  return z.enum(expressionNames(expressions), {
    error: (issue) => (typeof issue.input === "string" ? "unknown-expression" : "missing"),
  })
}

/**
 * 答えを形に当てて返す。落ちたときは最初の issue から理由を引く
 * （型の違い・欠けは `missing`、それ以外の検査は message の名前そのもの）。
 */
export function checkWelcomeAnswer<T>(
  schema: z.ZodType<T>,
  value: unknown,
): CheckedAnswer<T, WelcomeRejection> {
  const parsed = schema.safeParse(value)
  if (parsed.success) {
    return { kind: "accepted", value: parsed.data }
  }
  const [issue] = parsed.error.issues
  return { kind: "rejected", reason: rejectionOf(issue) }
}

export function rejected(reason: WelcomeRejection): {
  readonly kind: "rejected"
  readonly reason: WelcomeRejection
} {
  return { kind: "rejected", reason }
}

function rejectionOf(issue: z.core.$ZodIssue | undefined): WelcomeRejection {
  if (issue === undefined || issue.code === "invalid_type") {
    return "missing"
  }
  return CHECK_REJECTIONS.find((reason) => reason === issue.message) ?? "missing"
}
