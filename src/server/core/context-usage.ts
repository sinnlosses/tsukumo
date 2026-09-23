// コンテキストの内訳を記録に残すときの書き口の契約（`core/token-usage.ts` と同じ切り分け）。
// **実際に書くのは `src/server/adapter/context-usage-log.ts`**、**いつ書くかを決めるのは
// `src/server/core/session-manager.ts`**（「このセッションではもう書いたか」という可変の状態を
// 持つのはあそこだけで、セッション1つぶんの持ち物をここに増やさない）。
//
// **数と名前しか通らない。** 会話の文面・ツールの引数と結果は {@link ContextUsageEntry} に口が
// 無く、書いてよいものの線は `src/shared/context-usage-record.ts` が引いている
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { type ContextUsage } from "../../shared/context-usage.ts"
import { type TokenUsageMode } from "../../shared/token-usage.ts"

/**
 * 1セッションぶんの記録（**書き出す行そのものではない**）。`at` はエポックミリ秒で、
 * ISO 8601 への変換と日付ごとのファイルの選択は `adapter` 側の仕事（`TokenUsageEntry` と
 * 同じ切り分け）。
 */
export type ContextUsageEntry = {
  readonly at: number
  /** claude 側のセッションID。**同じIDで二度渡さない**のは呼ぶ側の責任。 */
  readonly sessionId: string
  readonly mode: TokenUsageMode
  readonly usage: ContextUsage
}

/**
 * コンテキストの内訳の書き込み口。**読み口は持たない** — この記録を読むのは tsukumo の外
 * （過去にさかのぼる分析）で、プロセスの中で読み戻す相手がいない。
 *
 * 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
 * `docs/coding-standards.md`「エラーハンドリング」）ので、受け付けたかどうかは返さない。
 */
export type ContextUsageLog = {
  readonly append: (entry: ContextUsageEntry) => void
}
