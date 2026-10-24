// 迎えの書き手が書かせる1行（挨拶の文と反応の行）の字数と、受け取った欄の検査。純関数と定数だけ。

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { WelcomeRejection } from "../../../shared/diagnostic/welcome-writing.ts"
import { WELCOME_GREETING_CARD_MARK } from "../../../shared/recommendation/welcome-greeting.ts"
import type { CheckedAnswer } from "./retried-query.ts"

/** 1行を検査する上限（文字。差し込み口も数える）。 */
const WELCOME_LINE_CHARS = 60

/** 指示文で頼む1行の字数（検査の上限 {@link WELCOME_LINE_CHARS} より短い）。 */
export const WELCOME_LINE_REQUESTED_CHARS = 50

/**
 * 空でない・改行を含まない・{@link WELCOME_LINE_CHARS} 字以下で、差し込み口をちょうど `marks` 個持つ1行
 * （前後の空白は落とす）。
 */
export function toWelcomeLine(value: unknown, marks: number): CheckedAnswer<string> {
  if (typeof value !== "string") {
    return rejected("missing")
  }
  const trimmed = value.trim()
  if (trimmed === "") {
    return rejected("empty")
  }
  if (trimmed.includes("\n")) {
    return rejected("newline")
  }
  if ([...trimmed].length > WELCOME_LINE_CHARS) {
    return rejected("too-long")
  }
  return trimmed.split(WELCOME_GREETING_CARD_MARK).length - 1 === marks
    ? { kind: "accepted", value: trimmed }
    : rejected("mark-count")
}

/** 表情の選択肢にある名前。 */
export function toExpression(
  value: unknown,
  expressions: readonly ExpressionChoice[],
): CheckedAnswer<Expression> {
  if (typeof value !== "string") {
    return rejected("missing")
  }
  const found = expressions.find((choice) => choice.name === value)
  return found === undefined
    ? rejected("unknown-expression")
    : { kind: "accepted", value: found.name }
}

export function rejected(reason: WelcomeRejection): {
  readonly kind: "rejected"
  readonly reason: WelcomeRejection
} {
  return { kind: "rejected", reason }
}
