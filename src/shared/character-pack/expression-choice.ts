// `speak` が選べる表情と、そのラベル。
// 名前はコード側の語彙、ラベルは `character.json` 側の言葉。

import type { CharacterDefinition } from "./character-definition.ts"
import { type Expression, EXPRESSIONS } from "./expression.ts"

/** `speak` で選べる表情1つ分。名前はコード側の語彙、ラベルは定義ファイル側の言葉。 */
export type ExpressionChoice = {
  readonly name: Expression
  readonly label: string
}

/**
 * `speak` ツールが受け付ける表情と、そのラベル。出どころは定義ファイル。
 *
 * - 選べるのは立ち絵かラベルのどちらかが定義にある表情（立ち絵が無い表情は `default` の絵に落ちるので、ラベルだけでも選ばせてよい）
 * - `default` は定義に無くても必ず含む（未知の表情の落とし先なので、これが無いと受け付けられる名前が1つも無くなる）
 * - ラベルが定義に無ければ表情名そのものをラベルにする（既定の日本語をコードに持たない）
 */
export function expressionChoices(
  definition: CharacterDefinition | undefined,
): readonly ExpressionChoice[] {
  if (definition === undefined) {
    return [{ name: "default", label: "default" }]
  }

  return EXPRESSIONS.filter(
    (expression) =>
      expression === "default" ||
      definition.portraits[expression] !== undefined ||
      definition.expressions[expression] !== undefined,
  ).map((expression) => ({
    name: expression,
    label: definition.expressions[expression] ?? expression,
  }))
}

/** 表情の一覧から名前だけを取り出す（`speak` の引数の照合など、ラベルが要らない側）。 */
export function expressionNames(choices: readonly ExpressionChoice[]): readonly Expression[] {
  return choices.map((choice) => choice.name)
}

/** 表情に対応するラベルを解く。一覧に無い表情（定義から消えたあとに残った状態など）は表情名をそのまま返す。 */
export function resolveExpressionLabel(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): string {
  return choices.find((choice) => choice.name === expression)?.label ?? expression
}

/**
 * `speak` ツールの zod enum に渡す表情名。
 * 空にならないことが型の要求なので、`default` を必ず先頭に置く。
 */
export function expressionEnumForSpeak(
  choices: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...expressionNames(choices).filter((name) => name !== "default")]
}

/**
 * `speak` ツールの説明へ入れる表情のガイド。
 * 表情名とラベルの対応をモデルに見せて、名前だけで意味を取れるようにする。
 */
export function expressionGuideForSpeak(choices: readonly ExpressionChoice[]): string {
  const guide = expressionEnumForSpeak(choices)
    .map((name) => `${name}（${resolveExpressionLabel(choices, name)}）`)
    .join(" / ")
  return `表情。${guide}`
}
