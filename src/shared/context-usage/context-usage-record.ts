// コンテキストの内訳を記録に残すときの形（型だけ）。
// 1行 = 1セッションで、ターンごとには積まない（内訳のうちメッセージ以外はセッションの中でほぼ変わらないため）。
//
// ターンごとの記録（`TokenUsageRecord`）とは置き場もファイルも版も分けてある（`~/.tsukumo/context-usage/<YYYY-MM-DD>.jsonl`）。
// 「書いてよいもの」の線が種類ごとに違うので、同じファイルに混ぜると広いほうの線が狭いほうにもかかる。
//
// この記録に書いてよいもの（`docs/coding-standards.md`「会話内容の扱い」の例外。この規約が最優先）:
//
// - 数（トークン数・割合・窓の大きさ）・時刻・セッションID・モード・モデルの名前
// - SDK が内訳として返す名前（分類の表示名・MCP ツール名・メモリファイルのパス・スキル名）。
//   ここがターンごとの記録より広い（「何が文脈を占めていたか」を後から見るのに名前が要る）
//
// 書かないもの:
//
// - 会話の文面・セリフ・ツールの引数と結果は1文字も入らない。
//   メッセージが占める量は分類1行の数として出るだけで、型にそもそも文字列の口を作らないことであとから足せないようにしてある

import type { TokenUsageMode } from "../token-usage/token-usage.ts"
import type { ContextUsage } from "./context-usage.ts"

/** 行の形の版（ターンごとの記録とは別に数える）。形を変えたら上げ、古い行と見分ける。 */
export const CONTEXT_USAGE_FORMAT_VERSION = 1 satisfies number

/**
 * JSONL に書く1行の形。1行 = 1セッションで、claude 側のセッションIDが変われば別の行になる。
 * 読むのは tsukumo の外の分析なので、この形を読み戻す口はコードの側に無い。`v` を書くのはその読む側のため。
 */
export type ContextUsageRecord = {
  readonly v: typeof CONTEXT_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID（`system/init` の `session_id`）。 */
  readonly sessionId: string
  /** そのセッションが仕事だったか雑談だったか。 */
  readonly mode: TokenUsageMode
  /** そのセッションの内訳（`getContextUsage()` の `detail: "full"` を写したもの）。 */
  readonly usage: ContextUsage
}
