// トークン消費の記録の形（型だけ）。
//
// 書いてよいのは数・モデルの名前・ツールの名前・時刻・セッションID・モードだけ。
// 依頼の文面・セリフ・ツールの引数と結果は1文字も持たせない。
// 型にそもそも文字列の口を作らないことで、あとから足せないようにしてある（長さは数なので、結果の大きさだけは残せる）。
//
// この線は広げない。
// コンテキストの内訳（メモリファイルのパスやスキル名を持つ）はここには入れず、別の形・別のファイル（`ContextUsageRecord`）に積む。

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const TOKEN_USAGE_FORMAT_VERSION = 2 satisfies number

/** そのターンが仕事だったか雑談だったか。 */
export type TokenUsageMode = "work" | "chat"

/**
 * モデル1つぶんの使用量。SDK の `modelUsage` の1件を写した形で、数だけを持つ（`inputTokens` などの名前も `sdk.d.ts` に合わせてある）。
 * 記録に書くときは「前の `result` からの増分」で、SDK から届く累計そのものではない。
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
 * ターンの中の持ち場。メインループか、サブエージェント（Agent ツール）の中かの2つ。
 * SDK の `parent_tool_use_id` が非 null かどうかで決まる（`sdk.d.ts`: 「non-null when the message was produced inside a subagent」）。
 */
export type TurnUsageScope = "main" | "subagent"

/**
 * assistant 1ステップぶんの使用量（SDK の `assistant` メッセージの `message.usage`）。
 * ステップの usage に `thinkingTokens` と費用は乗らない（思考は出力に含まれ、費用は `result` 側だけが持つ）。
 */
export type StepTokenUsage = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadInputTokens: number
  readonly cacheCreationInputTokens: number
}

/**
 * ツール1種類ぶんの内訳。呼び出し1件ずつではなくツールの名前ごとに畳む（1ターンで数十件になるので、1件ずつ残すと行が読めなくなる）。
 * `resultBytes` は結果の長さの合計だけ（UTF-8 のバイト数）。結果の本文も引数も記録しない。
 */
export type ToolUsageCount = {
  /** ツールの名前（`Bash` / `Read` / `mcp__tsukumo__remember` など）。 */
  readonly name: string
  /** そのターンに始まった呼び出しの回数（結果が返らなかったぶんも数える）。 */
  readonly calls: number
  readonly resultBytes: number
}

/** 持ち場（{@link TurnUsageScope}）1つぶんの内訳。 */
export type ScopeUsage = {
  /** 数えた assistant のステップ数（同じ `message.id` は1つ）。 */
  readonly steps: number
  /**
   * ステップの usage の合計（`message.id` ごとに最後の値だけを足したもの）。
   *
   * ターンの合計は {@link TokenUsageRecord.models} が正典で、これはその割り振りを見るための数。
   * 返答が流れている間の `usage` は確定値ではないので（`sdk.d.ts`）、実測では `outputTokens` が合計よりかなり小さく出る（下限として読む）。
   * どちらの持ち場が文脈を食ったかを見るには `inputTokens` と `cacheReadInputTokens` を使う（こちらは合計と近い値になる）。
   */
  readonly tokens: StepTokenUsage
  /** ツールの名前ごとの内訳。結果の長さの大きい順（同じなら名前順）。 */
  readonly tools: readonly ToolUsageCount[]
}

/**
 * そのターンの中を「何が文脈を膨らませたか」で割った内訳。
 * メインループとサブエージェントを同じ行の別立てにする（{@link TokenUsageRecord.models} はサブエージェントぶんも含むターンの合計なので、行を分けると合計と内訳が突き合わせられなくなる）。
 */
export type TurnUsageBreakdown = {
  readonly main: ScopeUsage
  readonly subagent: ScopeUsage
}

/**
 * JSONL に書く1行の形。1行 = 1ターン（SDK の `result` 1つ。サブエージェントの中の `result` は数えない）で、モデルが複数出たターンは `models` に並ぶ。
 * タスクには紐づけない（突き合わせは {@link at} の時刻で後追いする）。
 */
export type TokenUsageRecord = {
  readonly v: typeof TOKEN_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID（`system/init` の `session_id`）。 */
  readonly sessionId: string
  readonly mode: TokenUsageMode
  /** そのターンの増分。空の並びにはならない（増分が無いターンは行を書かない）。 */
  readonly models: readonly ModelTokenUsage[]
  /** ターンの中の内訳（合計の `models` を割ったもの）。 */
  readonly breakdown: TurnUsageBreakdown
}
