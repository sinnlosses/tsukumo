// 表情・衣装の名前と、モデルから衣装を決める規則。「決める」層。純粋関数で、fs/process には
// 触らない。
//
// **表情は `speak(text, expression)` の引数だけから決まる**（キャラ自身が選ぶ。
// docs/requirements.md「4.3 状態連動」2026-09-11 決定）。**表情の源が1つしか無いので、
// ここには「いま出す表情」を決める関数が無い**（`SessionState.speechExpression` がそのまま
// 答えになる）。ツールの実行中に自動で「作業中」へ上書きする経路は 2026-09-17 に撤去した
// （吹き出しと表情が食い違う唯一の経路だった。理由は docs/requirements.md 4.3）。
//
// **表情の日本語ラベルはここに持たない。** キャラクターごとの言葉なので定義ファイル側
// （`character.json` の `expressions`）にあり、解くのは src/shared/expression-choice.ts
// （docs/architecture.md 原則4「キャラクターの中身をコードに書かない」、docs/design.md 7章）。
// モデル名と衣装の対応だけは、どのキャラクターでも同じ「装備の重さ」の規則なのでここに残す。

export type Expression = "default" | "thinking" | "proud" | "flustered" | "serious" | "curious"
export type Outfit = "default" | "light" | "normal" | "heavy"

/**
 * 表情名の全体。**`default` が先頭**で、キャラクター定義に立ち絵があるものだけを選ぶときの
 * 元になる（src/shared/expression-choice.ts の `expressionChoices`）。**足すものは末尾に積む**
 * （既存の並びを動かさず、パック作者から見える順を変えないため。docs/requirements.md 4.3）。
 */
export const EXPRESSIONS: readonly Expression[] = [
  "default",
  "thinking",
  "proud",
  "flustered",
  "serious",
  "curious",
]

/**
 * **立ち絵が必ず要る表情**（`characters/README.md`）。`default` は表情の指定が無いときの
 * 落とし先で、コードが名前で直接参照するので「あるものだけ」で済ませられない。画面から
 * これを消せないのも同じ理由（消せる表情は {@link RemovableExpression} のほうだけ）。
 *
 * **必須はこの1つだけ。** 他の表情は立ち絵が無くてよく、`default` に落ちる
 * （`src/shared/character.ts` の `resolvePortraitUrl`）。
 */
export const REQUIRED_EXPRESSIONS = ["default"] as const

export type RequiredExpression = (typeof REQUIRED_EXPRESSIONS)[number]

/** 画面から立ち絵を**消せる**表情（必須の `default` を除いた残り）。 */
export type RemovableExpression = Exclude<Expression, RequiredExpression>

/** 衣装の全体。並びは画面に出す順（軽いほうから重いほうへ）。 */
export const OUTFITS: readonly Outfit[] = ["default", "light", "normal", "heavy"]

/** 外から届いた文字列が表情の名前かどうかを検証する（境界で1回だけ使う）。 */
export function isExpression(value: string): value is Expression {
  return EXPRESSIONS.some((expression) => expression === value)
}

/** 外から届いた文字列が、立ち絵を消せる表情の名前かどうかを検証する。 */
export function isRemovableExpression(value: string): value is RemovableExpression {
  return isExpression(value) && !REQUIRED_EXPRESSIONS.some((required) => required === value)
}

/** 外から届いた文字列が衣装の名前かどうかを検証する。 */
export function isOutfit(value: string): value is Outfit {
  return OUTFITS.some((outfit) => outfit === value)
}

/**
 * モデル名から衣装を決める。`haiku` = 軽装 / `sonnet` = 通常装備 / `opus` / `fable` = 戦闘配置
 * （docs/requirements.md「4.3 状態連動」、`~/.claude/output-styles/asuna.md` のモデル分岐と対応）。
 * `fable` は `opus` と同じ戦闘配置に割り当てる（2026-09-17 決定。衣装は「装備の重さ」の3段の
 * ままとし、`OUTFITS` を増やさない）。
 *
 * 渡ってくる `model` が短い別名（"opus" など）か解決済みの完全なモデルIDかは場合による
 * （SDK の `init` は完全なモデルIDを返す）ため、部分一致で両方を拾う。
 */
export function resolveOutfit(model: string | undefined): Outfit {
  if (model === undefined) {
    return "default"
  }

  const lowerModel = model.toLowerCase()
  const matched = OUTFIT_BY_MODEL_SUBSTRING.find(([needle]) => lowerModel.includes(needle))
  return matched?.[1] ?? "default"
}

const OUTFIT_BY_MODEL_SUBSTRING: readonly (readonly [needle: string, outfit: Outfit])[] = [
  ["haiku", "light"],
  ["sonnet", "normal"],
  ["opus", "heavy"],
  ["fable", "heavy"],
]
