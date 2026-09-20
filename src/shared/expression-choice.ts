// `speak` が選べる表情と、そのラベル。**名前はコード側の語彙（`expression.ts`）、ラベルは
// キャラクター定義ファイル側の言葉**（docs/architecture.md 原則4「キャラクターの中身をコードに
// 書かない」、docs/design.md 7章）。
//
// 読むのは `speak` ツールの enum を組み立てる駆動（`src/server/adapter/sdk-driver.ts`）と、
// 表情のラベルを出す画面。`node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type CharacterDefinition } from "./character-definition.ts"
import { type Expression, EXPRESSIONS } from "./expression.ts"

/** `speak` で選べる表情1つ分。名前はコード側の語彙、ラベルは定義ファイル側の言葉。 */
export type ExpressionChoice = {
  readonly name: Expression
  readonly label: string
}

/**
 * `speak` ツールが受け付ける表情と、そのラベル。**出どころは定義ファイル**
 * （docs/architecture.md 原則4「キャラクターの中身をコードに書かない」）。
 *
 * - 選べるのは**立ち絵かラベルのどちらかが定義にある表情**（立ち絵が無い表情は `default` の
 *   絵に落ちるので、ラベルだけでも選ばせてよい。docs/requirements.md 4.4）
 * - **`default` は定義に無くても必ず含む**（未知の表情の落とし先なので、これが無いと
 *   受け付けられる名前が1つも無くなる）
 * - ラベルが定義に無ければ**表情名そのもの**をラベルにする（既定の日本語をコードに持たない）
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

/**
 * 表情に対応するラベルを解く。一覧に無い表情（定義から消えたあとに残った状態など）は
 * 表情名をそのまま返す。
 */
export function resolveExpressionLabel(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): string {
  return choices.find((choice) => choice.name === expression)?.label ?? expression
}
