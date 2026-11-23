// 表情の名前。
//
// 表情は `speak(text, expression)` の引数だけから決まる（キャラ自身が選ぶ）。
// ここには「いま出す表情」を決める関数が無い（`SessionState.speechExpression` か、反応の行の表情がそのまま答えになる）。
// ツールの実行中に自動で「作業中」へ上書きする経路は持たない（吹き出しと表情が食い違う。理由は docs/requirements.md「状態連動」）。
//
// 役割の名は持つ（全パックで同じ。docs/architecture/adr/0084）。パックのラベルは持たない（定義ファイルの `expressions` にあり、解くのは `expressionChoices`）。

/**
 * 表情名の全体。`default` が先頭。
 * 足すものは末尾に積む（既存の並びを動かさず、パック作者から見える順を変えないため）。
 * 型 {@link Expression} も表（`fromKeys(EXPRESSIONS, …)`）もこの並びから導くので、表情を1つ足すときはここに1行積むだけでよい。
 */
export const EXPRESSIONS = [
  "default",
  "thinking",
  "proud",
  "flustered",
  "serious",
  "curious",
  "sad",
  "excited",
  "bored",
] as const

export type Expression = (typeof EXPRESSIONS)[number]

/**
 * 表情ごとの役割の名と、選ぶ場面の1文。全パックで同じ（ADR 0084「1.」）。
 * 表情を足す・意味を変えるときは、演出（`SPEECH_ARRIVALS`）と同時に直す。
 */
export const EXPRESSION_ROLES = {
  default: { name: "通常", scene: "特に感情を乗せない、ふだんの話し方のとき" },
  thinking: { name: "考え中", scene: "調べている・迷っている・考えをまとめているとき" },
  proud: { name: "得意気", scene: "うまくいった・やり遂げた・自信があるとき" },
  flustered: { name: "慌て", scene: "失敗した・想定外で焦った・照れて取り乱したとき" },
  serious: { name: "真剣", scene: "大事な確認・警告・気を引き締めて伝えるとき" },
  curious: { name: "驚き", scene: "意外な発見・気になること・不思議に思ったとき" },
  sad: { name: "悲しみ", scene: "残念な結果・うまくいかなかった・申し訳ないとき" },
  excited: { name: "高揚", scene: "わくわくする・うれしい・勢いづいているとき" },
  bored: { name: "退屈", scene: "待ちくたびれた・変化がない・気が抜けているとき" },
} as const satisfies Record<Expression, { readonly name: string; readonly scene: string }>

/**
 * 立ち絵が必ず要る表情（`characters/README.md`）。
 * `default` は表情の指定が無いときの落とし先で、コードが名前で直接参照するので「あるものだけ」で済ませられない。
 * 画面からこれを消せないのも同じ理由（消せる表情は {@link RemovableExpression} のほうだけ）。
 * 必須はこの1つだけで、他の表情は立ち絵が無くてよく、`default` に落ちる。
 */
const REQUIRED_EXPRESSIONS = ["default"] as const

export type RequiredExpression = (typeof REQUIRED_EXPRESSIONS)[number]

/** 画面から立ち絵を消せる表情（必須の `default` を除いた残り）。 */
export type RemovableExpression = Exclude<Expression, RequiredExpression>

/** 外から届いた文字列が表情の名前かどうかを検証する（境界で1回だけ使う）。 */
export function isExpression(value: string): value is Expression {
  return EXPRESSIONS.some((expression) => expression === value)
}

/** 外から届いた文字列が、立ち絵を消せる表情の名前かどうかを検証する。 */
export function isRemovableExpression(value: string): value is RemovableExpression {
  return isExpression(value) && !REQUIRED_EXPRESSIONS.some((required) => required === value)
}
