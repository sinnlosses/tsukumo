// 状態ファイルの内容から、表情と衣装を決める。「決める」層。純粋関数で、fs/process には触らない。
//
// hook イベント名と表情の対応、モデル名と衣装の対応は、キャラクター定義ファイルの形式がまだ
// 決まっていないため（docs/requirements.md「7. 未決事項」）、当面ここに置く。形式が決まったら
// 定義ファイル側へ移す（docs/architecture.md 原則4「キャラクターの中身をコードに書かない」）。
//
// 状態ファイルが無い・壊れている・未知のイベント種別のときは "default" に落ちる
// （docs/requirements.md「4.3 状態連動」）。

import { type StateFileContents } from "./state.ts"

export type Expression = "default" | "working" | "proud" | "flustered"
export type Outfit = "default" | "light" | "normal" | "heavy"

/**
 * 表情名の全体。**`default` が先頭**で、キャラクター定義に立ち絵があるものだけを選ぶときの
 * 元になる（src/character.ts の `availableExpressions`）。
 */
export const EXPRESSIONS: readonly Expression[] = ["default", "working", "proud", "flustered"]

/**
 * 状態ファイルの `event` から表情を決める。対応の初期案
 * （docs/requirements.md「4.3 状態連動」）: `PreToolUse` = 作業中 / `Stop` = どや顔 /
 * エラー = あわあわ。エラー系は `StopFailure` と `PostToolUseFailure` の2つが実在する
 * （実測で確認済みのイベント名だけを使い、推測でイベント名を作らない）。
 */
export function resolveExpression(state: StateFileContents | undefined): Expression {
  if (state === undefined) {
    return "default"
  }

  return EXPRESSION_BY_EVENT[state.event] ?? "default"
}

/**
 * モデル名から衣装を決める。`haiku` = 軽装 / `sonnet` = 通常装備 / `opus` = 戦闘配置
 * （docs/requirements.md「4.3 状態連動」、`~/.claude/output-styles/asuna.md` のモデル分岐と対応）。
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

/**
 * 表情の日本語ラベル。立ち絵の alt / aria-label に使う
 * （画像だけでは伝わらない状態を、スクリーンリーダー等に文字で残すため）。
 */
export function expressionLabel(expression: Expression): string {
  return EXPRESSION_LABEL[expression]
}

const EXPRESSION_BY_EVENT: Readonly<Record<string, Expression>> = {
  PreToolUse: "working",
  Stop: "proud",
  StopFailure: "flustered",
  PostToolUseFailure: "flustered",
}

const OUTFIT_BY_MODEL_SUBSTRING: readonly (readonly [needle: string, outfit: Outfit])[] = [
  ["haiku", "light"],
  ["sonnet", "normal"],
  ["opus", "heavy"],
]

const EXPRESSION_LABEL: Readonly<Record<Expression, string>> = {
  default: "通常",
  working: "作業中",
  proud: "どや顔",
  flustered: "あわあわ",
}
