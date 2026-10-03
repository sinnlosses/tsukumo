// 出力の形（JSON Schema）つきの使い捨ての問い合わせ1回に渡すもの。

/** `query()` に渡すもの（モデル・指示文・依頼の文面・出力の形）。 */
export type StructuredQuery = {
  readonly model: string
  /** `query()` の `systemPrompt` をそのまま置き換える指示文。 */
  readonly systemPrompt: string
  readonly prompt: string
  readonly schema: Readonly<Record<string, unknown>>
}
