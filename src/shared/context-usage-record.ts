// コンテキストの内訳を記録に残すときの形（`docs/glossary.md`「コンテキストの内訳」）。
// **1行 = 1セッション**で、内訳のうちメッセージ以外（システムプロンプト・ツール定義・
// メモリファイル・スキル・MCP）はセッションの中でほぼ変わらず、変わるのはセッションを
// またいだときだから、ターンごとには積まない。
// **ここにあるのは型だけ**で、書くのは `src/server/adapter/context-usage-log.ts`、いつ書くかを
// 決めるのは `src/server/core/session-manager.ts`。
//
// **ターンごとの記録（`src/shared/token-usage.ts`）とは置き場もファイルも版も分けてある**
// （`~/.tsukumo/context-usage/<YYYY-MM-DD>.jsonl`）。分けたのは、**「書いてよいもの」の線が
// 種類ごとに違う**から——同じファイルに混ぜると、広いほうの線が狭いほうにもかかる。
//
// **この記録に書いてよいもの**（`docs/coding-standards.md`「会話内容の扱い」。この規約が最優先）:
//
// - 数（トークン数・割合・窓の大きさ）・時刻・セッションID・モード・モデルの名前
//   — ターンごとの記録と同じ線
// - **SDK が内訳として返す名前** — 分類の表示名・MCP ツール名・メモリファイルのパス・スキル名。
//   **ここがターンごとの記録より広い**（あちらはツールの名前までで、パスは通らない）。
//   広げたのは、「何が文脈を占めていたか」を後から見るのに名前が要るから
//
// **書かないもの**（広げていない線）:
//
// - 会話の文面・セリフ・ツールの引数と結果は1文字も入らない。メッセージが占める量は
//   分類1行の**数**として出るだけで、文面の口は型に無い（ターンごとの記録と同じ手で、
//   型にそもそも文字列の口を作らないことであとから足せないようにしてある）
// - だから**「別の場所に複製しない」の例外の表**（雑談の要約・雑談の会話・その日の見出し）には
//   数えない——複製しているのは会話ではない
//
// **ターンごとの記録の線は変えない。** `src/shared/token-usage.ts` の行に鍵は1つも増えず、
// `TOKEN_USAGE_FORMAT_VERSION` も据え置き。

import { type ContextUsage } from "./context-usage.ts"
import { type TokenUsageMode } from "./token-usage.ts"

/**
 * 行の形の版（`token-usage` とは別のファイルに積むので、**版も別に数える**）。形を変えたら
 * 上げ、古い行と見分ける。
 */
export const CONTEXT_USAGE_FORMAT_VERSION = 1 satisfies number

/**
 * JSONL に書く1行の形。**1行 = 1セッション**で、claude 側のセッションIDが変われば別の行になる。
 *
 * **読むのは tsukumo の外**（過去にさかのぼって「何が文脈を占めていたか」を見る分析）なので、
 * この形を読み戻す口はコードの側に無い。`v` を書くのはその読む側のため。
 */
export type ContextUsageRecord = {
  readonly v: typeof CONTEXT_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID（`system/init` の `session_id`）。 */
  readonly sessionId: string
  /**
   * そのセッションが仕事だったか雑談だったか。**型はターンごとの記録と同じ**
   * （同じ2値の区別なので、記録の種類ごとに増やさない）。
   */
  readonly mode: TokenUsageMode
  /** そのセッションの内訳（`getContextUsage()` の `detail: "full"` を写したもの）。 */
  readonly usage: ContextUsage
}
