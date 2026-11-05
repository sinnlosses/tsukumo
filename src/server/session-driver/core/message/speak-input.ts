import { z } from "zod"

import { expressionEnumFromNames } from "../../../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../../../shared/character-pack/expression.ts"

/** `speak` の引数の shape。説明文は付けない（モデルに見せる側が足す）。 */
export function speakInputShape(expressions: readonly Expression[]) {
  return {
    text: z.string(),
    expression: z.enum(expressionEnumFromNames(expressions)),
    // 0 や負の数も形では通し、範囲の検査の差し戻しで直し方を返す。
    phase: z.number().int().optional(),
  }
}

/** ストリームから読む側の schema。選択肢の外・欠けた表情は `default` に、不正な `phase` は無しに倒し、`text` が無ければ失敗にする。 */
export function speakInputSchema(expressions: readonly Expression[]) {
  const shape = speakInputShape(expressions)
  return z.object({
    ...shape,
    expression: shape.expression.catch("default"),
    phase: shape.phase.catch(undefined),
  })
}
