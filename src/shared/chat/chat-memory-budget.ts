// 記憶（雑談と仕事で1つ）の容量を1つに集めた表。値を書き換えるだけで上げ下げできる。
// 設定ファイル・環境変数から上書きする口は作らない。

export type ChatMemoryBudget = {
  /** 雑談のセッションの作業記憶（逐語のまま読み戻す窓）の上限バイト数。 */
  readonly recentBytes: number
  /** 仕事のセッションの作業記憶の上限バイト数。定着が畳む境目もこれ。 */
  readonly workRecentBytes: number
  /** あらすじの上限バイト数。 */
  readonly synopsisBytes: number
  /** 定着を起こす契機（畳む行が this 以上たまったら起こす）の上限バイト数。 */
  readonly consolidateEveryBytes: number
  /** 仕事の依頼の冒頭・`report` の結論をアーカイブへ書くときに切る上限（コードポイント数）。 */
  readonly workExcerptChars: number
}

/** 記憶の容量の表。値の根拠は `docs/architecture/chat-mode.md`「記憶の圧縮と忘却」の容量の表にある。 */
export const CHAT_MEMORY_BUDGET = {
  recentBytes: 65_536,
  workRecentBytes: 16_384,
  synopsisBytes: 8_192,
  consolidateEveryBytes: 8_192,
  workExcerptChars: 300,
} satisfies ChatMemoryBudget
