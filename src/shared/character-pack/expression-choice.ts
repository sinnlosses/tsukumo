// `speak` が選べる表情と、そのラベル。
// 名前はコード側の語彙、ラベルは `character.json` 側の言葉。

import type { CharacterDefinition } from "./character-definition.ts"
import { type Expression, EXPRESSION_ROLES, EXPRESSIONS } from "./expression.ts"

/** `speak` で選べる表情1つ分。名前と役割の名はコード側の語彙、ラベルは定義ファイル側の言葉（任意）。 */
export type ExpressionChoice = {
  readonly name: Expression
  readonly role: string
  readonly label?: string
}

/**
 * `speak` ツールが受け付ける表情と、そのラベル。出どころは定義ファイル。
 *
 * - 選べるのは立ち絵かラベルのどちらかが定義にある表情（立ち絵が無い表情は `default` の絵に落ちるので、ラベルだけでも選ばせてよい）
 * - `default` は定義に無くても必ず含む（未知の表情の落とし先なので、これが無いと受け付けられる名前が1つも無くなる）
 * - 役割の名は必ず入る。ラベルは定義にあるときだけ入る
 */
export function expressionChoices(definition?: CharacterDefinition): readonly ExpressionChoice[] {
  if (definition === undefined) {
    return [choiceOf("default")]
  }

  return EXPRESSIONS.filter(
    (expression) =>
      expression === "default" ||
      definition.portraits[expression] !== undefined ||
      definition.expressions[expression] !== undefined,
  ).map((expression) => choiceOf(expression, definition.expressions[expression]))
}

/** 表情の一覧から名前だけを取り出す（`speak` の引数の照合など、ラベルが要らない側）。 */
export function expressionNames(choices: readonly ExpressionChoice[]): readonly Expression[] {
  return choices.map((choice) => choice.name)
}

/** 表情の役割の名（`考え中`）。パックによらず同じ。 */
export function expressionRoleName(expression: Expression): string {
  return EXPRESSION_ROLES[expression].name
}

/** 役割の名に添えるパックのラベル（`{ labelNote }`）。無い・役割の名と同じ字・一覧に無い表情は空のオブジェクト。 */
export function expressionLabelNote(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): { readonly labelNote?: string } {
  const label = choices.find((choice) => choice.name === expression)?.label
  return label === undefined || label === EXPRESSION_ROLES[expression].name
    ? {}
    : { labelNote: label }
}

/** 表情1つの説明。`thinking: 考え中（ふむ）。調べている・迷っているとき` の形。 */
export function expressionDescription(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): string {
  return `${expression}: ${expressionRoleWithLabel(choices, expression)}。${EXPRESSION_ROLES[expression].scene}`
}

/**
 * `speak` ツールの zod enum に渡す表情名。
 * 空にならないことが型の要求なので、`default` を必ず先頭に置く。
 */
export function expressionEnumForSpeak(
  choices: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return expressionEnumFromNames(expressionNames(choices))
}

/** 表情名の並びから zod enum に渡す並びを作る。`default` を必ず先頭に置く。 */
export function expressionEnumFromNames(
  names: readonly Expression[],
): [Expression, ...Expression[]] {
  return ["default", ...names.filter((name) => name !== "default")]
}

/**
 * `speak` ツールの説明へ入れる表情のガイド。
 * 表情名・役割の名・場面をモデルに見せて、名前だけで意味を取れるようにする。
 */
export function expressionGuideForSpeak(choices: readonly ExpressionChoice[]): string {
  const guide = expressionEnumForSpeak(choices)
    .map((name) => expressionDescription(choices, name))
    .join(" / ")
  return `表情。${guide}`
}

/**
 * 役割の名にパックのラベルを括弧で添えた文字列（`考え中（ふむ）`）。
 * ラベルが無い・役割の名と同じ字・一覧に無い表情（定義から消えたあとに残った状態など）は役割の名だけ。
 */
export function expressionRoleWithLabel(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): string {
  const role = EXPRESSION_ROLES[expression].name
  const { labelNote } = expressionLabelNote(choices, expression)
  return labelNote === undefined ? role : `${role}（${labelNote}）`
}

function choiceOf(name: Expression, label?: string): ExpressionChoice {
  const role = EXPRESSION_ROLES[name].name
  return label === undefined ? { name, role } : { name, role, label }
}
