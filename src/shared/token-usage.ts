// トークン消費の記録の形（**何にどれだけ使ったかを残す**ため。2026-09-22 に足した。それまで
// SDK が渡してくる使用量は届いた時点で捨てていた）。
// **ここにあるのは型だけ**で、書くのは `src/server/adapter/token-usage-log.ts`、何をいつ書くかを
// 決めるのは `src/server/core/session-manager.ts`。
//
// **書いてよいのは数・モデルの名前・時刻・セッションID・モードだけ。** 依頼の文面・セリフ・
// ツールの引数と結果は1文字も持たせない（`docs/coding-standards.md`「会話内容の扱い」。
// この規約が最優先）。型にそもそも文字列の口を作らないことで、あとから足せないようにしてある。

/** 行の形の版（`chat-archive` と同じ考え方。形を変えたら上げ、古い行と見分ける）。 */
export const TOKEN_USAGE_FORMAT_VERSION = 1 satisfies number

/** そのターンが仕事だったか雑談だったか（`docs/glossary.md`「雑談モード」）。 */
export type TokenUsageMode = "work" | "chat"

/**
 * モデル1つぶんの使用量。**SDK の `modelUsage` の1件を写した形**で、数だけを持つ
 * （`inputTokens` などの名前も SDK に合わせてある。2026-09-22 時点の `sdk.d.ts`）。
 *
 * **記録に書くときは「前の `result` からの増分」**で、SDK から届く累計そのものではない
 * （差分を取るのは `src/server/core/token-usage.ts`）。同じ型を累計にも増分にも使うのは、
 * 持っている数の並びが同じだから。
 */
export type ModelTokenUsage = {
  /** モデルの名前（SDK の `modelUsage` の鍵をそのまま）。 */
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly thinkingTokens: number
  readonly cacheReadInputTokens: number
  readonly cacheCreationInputTokens: number
  readonly costUsd: number
}

/**
 * JSONL に書く1行の形。**1行 = 1ターン**（SDK の `result` 1つ。サブエージェントの中の
 * `result` は数えない）で、モデルが複数出たターンは `models` に並ぶ。
 *
 * **タスク（`T-xxx`）には紐づけない**（ユーザーの選択。突き合わせは {@link at} の時刻で
 * 後追いする）ので、`develop/tasks.json` は読みに行かない。
 */
export type TokenUsageRecord = {
  readonly v: typeof TOKEN_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID（`system/init` の `session_id`）。 */
  readonly sessionId: string
  readonly mode: TokenUsageMode
  /** そのターンの増分。**空の並びにはならない**（増分が無いターンは行を書かない）。 */
  readonly models: readonly ModelTokenUsage[]
}
