// 雑談の記憶の容量を1つに集めた表（`docs/design.md` 7章「エピソード索引はどこに置くか」）。
// **値を書き換えるだけで上げ下げできるようにする**（ユーザーの指示）。設定ファイル・
// 環境変数から上書きする口は作らない。**値の根拠は書かず、`docs/chat-mode.md` 4.9「記憶の圧縮と
// 忘却」の容量の表を指すだけにする**（正典を2つにしない）。
//
// サーバの複数の機能（`session`・`system-prompt`・`chat`）と配線（`src/session-start.ts`）が読むので
// `shared` に置く（ブラウザは読まない）。`node:` にも `document` にも触らない（他の shared と
// 同じ制約）。

/** {@link CHAT_MEMORY_BUDGET} の形。値そのものはここではなく `docs/chat-mode.md` 4.9 を見る。 */
export type ChatMemoryBudget = {
  /** 作業記憶（逐語のまま読み戻す窓）の上限バイト数。 */
  readonly recentBytes: number
  /** あらすじの上限バイト数。 */
  readonly synopsisBytes: number
  /** `recall` の一覧1回ぶんの上限バイト数。 */
  readonly recallListBytes: number
  /** `recall` の一覧を1ターンに引ける回数。 */
  readonly recallListsPerTurn: number
  /** `recall_episode` で開く1件の逐語の上限バイト数。 */
  readonly recallEpisodeBytes: number
  /** `recall_episode` を1ターンに開ける件数。 */
  readonly recallEpisodesPerTurn: number
  /** 定着を起こす契機（畳む行が this 以上たまったら起こす）の上限バイト数。 */
  readonly consolidateEveryBytes: number
}

/** 雑談の記憶の容量の表。値の根拠は `docs/chat-mode.md` 4.9「記憶の圧縮と忘却」。 */
export const CHAT_MEMORY_BUDGET = {
  recentBytes: 65_536,
  synopsisBytes: 8_192,
  recallListBytes: 2_048,
  recallListsPerTurn: 2,
  recallEpisodeBytes: 8_192,
  recallEpisodesPerTurn: 2,
  consolidateEveryBytes: 8_192,
} satisfies ChatMemoryBudget
