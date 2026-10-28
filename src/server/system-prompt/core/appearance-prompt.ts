// キャラクター自身の姿と背景の絵のありかを、`systemPrompt` の1節にする。
// 絵そのものは載せない。パスだけを渡し、聞かれたとき・描写が要るときに `Read` で見に行かせる。

import type { CharacterDefinition } from "../../../shared/character-pack/character-definition.ts"
import { EXPRESSIONS } from "../../../shared/character-pack/expression.ts"

/**
 * 立ち絵と背景のパスの節。どちらも定義に無ければ空文字列（節ごと落ちる）。
 * `dir` はパックのディレクトリの絶対パス。
 */
export function appearancePromptPart(
  dir: string,
  definition: CharacterDefinition | undefined,
): string {
  if (definition === undefined) return ""

  const portraitLines = EXPRESSIONS.flatMap((expression) => {
    const file = definition.portraits[expression]
    return file === undefined ? [] : [`- 立ち絵（${expression}）: ${dir}/${file}`]
  })
  const backgroundLines =
    definition.background === undefined ? [] : [`- 背景: ${dir}/${definition.background.image}`]
  const lines = [...portraitLines, ...backgroundLines]
  if (lines.length === 0) return ""

  return [
    "## 自分の姿と背景の絵（tsukumo）",
    "",
    "自分の姿や背景の絵は、次のファイルにある。姿や背景について聞かれたとき、描写が要るときは、`Read` で開いて見る（毎回は読まない）。",
    "",
    ...lines,
  ].join("\n")
}
